#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = new URL("../", import.meta.url).pathname.replace(/\/$/u, "");
const wordbooksRoot = join(projectRoot, "public", "wordbooks");
const audioRoot = join(projectRoot, "public", "audio");
const exampleAudioRoot = join(audioRoot, "examples");
const voice = process.env.WORTTAG_AUDIO_VOICE ?? "Anna";
const bitrate = process.env.WORTTAG_AUDIO_BITRATE ?? "24000";
const chunkSize = Math.max(10, Number(process.env.WORTTAG_AUDIO_CHUNK_SIZE ?? 50));
const concurrency = Math.max(1, Number(process.env.WORTTAG_AUDIO_CONCURRENCY ?? 6));
const silenceMs = 1_200;
const activeWordbookFiles = ["a1-v2.json", "a2-v2.json", "b1-v2.json", "b2-v2.json", "c1-v2.json", "special-v2.json"];

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

async function outputExists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function loadJobs() {
  const words = [];
  const examples = [];
  const seenIds = new Set();

  for (const file of activeWordbookFiles) {
    const payload = JSON.parse(await readFile(join(wordbooksRoot, file), "utf8"));
    const level = typeof payload.level === "string" ? payload.level : file.slice(0, -5).toUpperCase();
    const levelPath = level.toLowerCase();
    for (const row of payload.words ?? []) {
      const [id, term, , , , example] = row;
      if (typeof id !== "string" || typeof term !== "string" || !term.trim()) {
        throw new Error(`${file} contains a word without a usable term.`);
      }
      if (seenIds.has(id)) throw new Error(`Duplicate active audio id: ${id}`);
      seenIds.add(id);
      words.push({
        id,
        level,
        text: term.replace(/^etwas\s+/u, "").trim(),
        output: join(audioRoot, levelPath, "anna", `${id}.m4a`),
        url: `/audio/${levelPath}/anna/${id}.m4a`,
      });
      if (typeof example === "string" && example.trim()) {
        examples.push({
          id,
          level,
          text: example.trim(),
          output: join(exampleAudioRoot, levelPath, "anna", `${id}.m4a`),
          url: `/audio/examples/${levelPath}/anna/${id}.m4a`,
        });
      }
    }
  }
  return { words, examples };
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
    if (silenceStart >= 0 && index - silenceStart >= silenceThreshold) boundaries.push([silenceStart, index]);
    silenceStart = -1;
  }
  if (silenceStart >= 0 && samples.length - silenceStart >= silenceThreshold) boundaries.push([silenceStart, samples.length]);
  const segments = [];
  let start = 0;
  for (const [silenceStartIndex, silenceEndIndex] of boundaries) {
    if (silenceStartIndex - start > sampleRate * 0.25) {
      segments.push(createWav(pcm.subarray(start * 2, silenceStartIndex * 2), sampleRate));
    }
    start = silenceEndIndex;
  }
  if (samples.length - start > sampleRate * 0.25) segments.push(createWav(pcm.subarray(start * 2), sampleRate));
  if (segments.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} speech segments, found ${segments.length}.`);
  }
  return segments;
}

async function encodeSegment(job, wav, tempRoot) {
  await mkdir(join(audioRoot, job.level.toLowerCase(), "anna"), { recursive: true });
  await mkdir(join(exampleAudioRoot, job.level.toLowerCase(), "anna"), { recursive: true });
  const stem = `${job.level}-${job.id.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  const source = join(tempRoot, `${stem}.wav`);
  await writeFile(source, wav);
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", bitrate, source, job.output]);
}

async function generateSingle(job, tempRoot) {
  await mkdir(join(audioRoot, job.level.toLowerCase(), "anna"), { recursive: true });
  await mkdir(join(exampleAudioRoot, job.level.toLowerCase(), "anna"), { recursive: true });
  const stem = `single-${job.level}-${job.id.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  const textPath = join(tempRoot, `${stem}.txt`);
  const source = join(tempRoot, `${stem}.aiff`);
  await writeFile(textPath, job.text, "utf8");
  await run("say", ["-v", voice, "-f", textPath, "-o", source]);
  await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", bitrate, source, job.output]);
}

async function generateSingles(jobs, tempRoot) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, jobs.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= jobs.length) return;
      await generateSingle(jobs[index], tempRoot);
    }
  });
  await Promise.all(workers);
}

async function generateChunk(jobs, chunkIndex, tempRoot) {
  const prefix = `chunk-${String(chunkIndex).padStart(4, "0")}`;
  const textPath = join(tempRoot, `${prefix}.txt`);
  const aiffPath = join(tempRoot, `${prefix}.aiff`);
  const wavPath = join(tempRoot, `${prefix}.wav`);
  await writeFile(textPath, jobs.map((job, index) => `${job.text}${index === jobs.length - 1 ? "" : ` [[slnc ${silenceMs}]]`}`).join("\n"), "utf8");
  await run("say", ["-v", voice, "-f", textPath, "-o", aiffPath]);
  await run("afconvert", ["-f", "WAVE", "-d", "LEI16@22050", aiffPath, wavPath]);
  let segments;
  try {
    segments = splitWav(await readFile(wavPath), jobs.length);
  } catch (error) {
    process.stderr.write(`分段不稳定，改用逐条生成（${jobs.length} 条）：${error.message}\n`);
    await generateSingles(jobs, tempRoot);
    return;
  }
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

async function filterPending(jobs) {
  const pending = [];
  for (const job of jobs) {
    if (!(await outputExists(job.output))) pending.push(job);
  }
  return pending;
}

async function generateJobs(label, jobs, tempRoot) {
  const pending = await filterPending(jobs);
  const chunks = [];
  for (let index = 0; index < pending.length; index += chunkSize) chunks.push(pending.slice(index, index + chunkSize));
  let completed = jobs.length - pending.length;
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= chunks.length) return;
      await generateChunk(chunks[index], index, tempRoot);
      completed += chunks[index].length;
      process.stdout.write(`${label}音频 ${completed}/${jobs.length}\n`);
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, chunks.length || 1) }, worker));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return pending.length;
}

function createManifest(jobs, kind) {
  return {
    schemaVersion: 2,
    voice: "Anna",
    language: "de-DE",
    format: "m4a/aac",
    bitrate: Number(bitrate),
    count: jobs.length,
    files: Object.fromEntries(jobs.map((job) => [job.id, job.url])),
    kind,
  };
}

const { words, examples } = await loadJobs();
const tempRoot = await mkdtemp(join(tmpdir(), "worttag-audio-"));
try {
  const addedWords = await generateJobs("单词", words, tempRoot);
  const addedExamples = await generateJobs("例句", examples, tempRoot);
  await writeFile(join(audioRoot, "manifest-v2.json"), `${JSON.stringify(createManifest(words, "word"), null, 2)}\n`, "utf8");
  await writeFile(join(exampleAudioRoot, "manifest-v2.json"), `${JSON.stringify(createManifest(examples, "example"), null, 2)}\n`, "utf8");
  process.stdout.write(`完成：单词 ${words.length} 条（新增 ${addedWords}），例句 ${examples.length} 条（新增 ${addedExamples}）。\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
