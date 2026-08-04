#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = new URL("../", import.meta.url).pathname.replace(/\/$/u, "");
const wordbooksRoot = join(projectRoot, "public", "wordbooks");
const outputRoot = join(projectRoot, "public", "audio", "examples");
const voice = process.env.WORTTAG_AUDIO_VOICE ?? "Anna";
const bitrate = process.env.WORTTAG_AUDIO_BITRATE ?? "24000";
const chunkSize = Math.max(10, Number(process.env.WORTTAG_AUDIO_CHUNK_SIZE ?? 50));
const concurrency = Math.max(1, Number(process.env.WORTTAG_AUDIO_CONCURRENCY ?? 8));
const silenceMs = 1_200;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function loadJobs() {
  const jobs = [];
  for (const file of (await readdir(wordbooksRoot)).filter((name) => name.endsWith(".json")).sort()) {
    const payload = JSON.parse(await readFile(join(wordbooksRoot, file), "utf8"));
    const level = typeof payload.level === "string" ? payload.level : file.slice(0, -5).toUpperCase();
    for (const row of payload.words ?? []) {
      const [id, , , , , example] = row;
      if (typeof id !== "string" || typeof example !== "string" || !example.trim()) {
        throw new Error(`${file} contains a word without a usable example.`);
      }
      jobs.push({ id, level, example: example.trim() });
    }
  }
  return jobs;
}

async function outputExists(job) {
  try {
    const file = join(outputRoot, job.level.toLowerCase(), "anna", `${job.id}.m4a`);
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("The speech renderer did not produce a WAV file.");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (chunkId === "fmt ") {
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bitsPerSample = buffer.readUInt16LE(start + 14);
    } else if (chunkId === "data") {
      dataStart = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (dataStart < 0 || !sampleRate || channels !== 1 || bitsPerSample !== 16) {
    throw new Error("The speech renderer returned an unsupported WAV format.");
  }
  return { sampleRate, pcm: buffer.subarray(dataStart, dataStart + dataSize) };
}

function createWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function splitWav(buffer, expectedCount) {
  const { sampleRate, pcm } = parseWav(buffer);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const silenceThreshold = Math.floor(sampleRate * (silenceMs / 1000) * 0.65);
  const boundaries = [];
  let silenceStart = -1;
  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index]) <= 400) {
      if (silenceStart < 0) silenceStart = index;
      continue;
    }
    if (silenceStart >= 0 && index - silenceStart >= silenceThreshold) {
      boundaries.push([silenceStart, index]);
    }
    silenceStart = -1;
  }
  if (silenceStart >= 0 && samples.length - silenceStart >= silenceThreshold) {
    boundaries.push([silenceStart, samples.length]);
  }
  const segments = [];
  let start = 0;
  for (const [silenceStartIndex, silenceEndIndex] of boundaries) {
    if (silenceStartIndex - start > sampleRate * 0.25) {
      segments.push(createWav(pcm.subarray(start * 2, silenceStartIndex * 2), sampleRate));
    }
    start = silenceEndIndex;
  }
  if (samples.length - start > sampleRate * 0.25) {
    segments.push(createWav(pcm.subarray(start * 2), sampleRate));
  }
  if (segments.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} speech segments, found ${segments.length}.`);
  }
  return segments;
}

async function encodeSegment(job, wav, tempRoot) {
  const levelRoot = join(outputRoot, job.level.toLowerCase(), "anna");
  await mkdir(levelRoot, { recursive: true });
  const stem = `${job.level}-${job.id.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  const source = join(tempRoot, `${stem}.wav`);
  const output = join(levelRoot, `${job.id}.m4a`);
  await writeFile(source, wav);
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", bitrate, source, output]);
}

async function generateChunk(jobs, chunkIndex, tempRoot) {
  const prefix = `chunk-${String(chunkIndex).padStart(3, "0")}`;
  const textPath = join(tempRoot, `${prefix}.txt`);
  const aiffPath = join(tempRoot, `${prefix}.aiff`);
  const wavPath = join(tempRoot, `${prefix}.wav`);
  await writeFile(
    textPath,
    jobs.map((job, index) => `${job.example}${index === jobs.length - 1 ? "" : ` [[slnc ${silenceMs}]]`}`).join("\n"),
    "utf8",
  );
  await run("say", ["-v", voice, "-f", textPath, "-o", aiffPath]);
  await run("afconvert", ["-f", "WAVE", "-d", "LEI16@22050", aiffPath, wavPath]);
  const segments = splitWav(await readFile(wavPath), jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, jobs.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      await encodeSegment(jobs[index], segments[index], tempRoot);
    }
  });
  await Promise.all(workers);
}

const allJobs = await loadJobs();
const pendingJobs = [];
for (const job of allJobs) {
  if (!(await outputExists(job))) pendingJobs.push(job);
}
const chunks = [];
for (let index = 0; index < pendingJobs.length; index += chunkSize) {
  chunks.push(pendingJobs.slice(index, index + chunkSize));
}
const tempRoot = await mkdtemp(join(tmpdir(), "worttag-example-audio-"));
let completed = allJobs.length - pendingJobs.length;
let cursor = 0;

try {
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= chunks.length) return;
      await generateChunk(chunks[index], index, tempRoot);
      completed += chunks[index].length;
      process.stdout.write(`例句音频 ${completed}/${allJobs.length}\n`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length || 1) }, worker));
  const manifest = {
    schemaVersion: 1,
    voice: "Anna",
    language: "de-DE",
    format: "m4a/aac",
    bitrate: Number(bitrate),
    count: allJobs.length,
    files: Object.fromEntries(allJobs.map(({ id, level }) => [
      id,
      `/audio/examples/${level.toLowerCase()}/anna/${id}.m4a`,
    ])),
  };
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`完成：${allJobs.length} 条，新增：${pendingJobs.length} 条\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
