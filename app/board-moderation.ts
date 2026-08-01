const MAX_CONTENT_LENGTH = 240;
const MAX_NICKNAME_LENGTH = 24;

const BLOCKED_PATTERNS: RegExp[] = [
  /色情|淫秽|淫乱|卖淫|嫖娼|裸聊|约炮|成人视频|色情片|porn|xxx|sexcam/i,
  /赌博|博彩|赌场|六合彩|赌球|下注|casino|betting|jackpot/i,
  /毒品|冰毒|海洛因|可卡因|芬太尼|大麻|cocaine|fentanyl|methamphetamine/i,
  /恐怖袭击|恐怖组织|爆炸物|制作炸弹|杀人|血洗|恐袭|terrorist|bomb[- ]?making/i,
  /诈骗|洗钱|杀猪盘|刷单|博彩代理|钓鱼网站|木马病毒|fraud|money laundering/i,
  /加微信|加微|加v|加 V|私聊|联系方式|二维码|群聊|telegram|t\.me|discord\.gg/i,
];

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\r\n?/g, "\n").trim()
    : "";
}

export type BoardModerationResult =
  | { ok: true; nickname: string; content: string }
  | { ok: false; message: string };

export function moderateBoardMessage(
  rawContent: unknown,
  rawNickname: unknown,
): BoardModerationResult {
  const content = normalizedText(rawContent);
  const nickname = normalizedText(rawNickname) || "匿名";

  if (!content || content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, message: "留言不能为空，且不能超过 240 个字。" };
  }
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return { ok: false, message: "昵称不能超过 24 个字。" };
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(content + nickname)) {
    return { ok: false, message: "留言包含不支持的控制字符。" };
  }
  if (/(.)\1{9,}/u.test(content.replace(/\s/g, ""))) {
    return { ok: false, message: "留言疑似重复灌水，未予展示。" };
  }
  if (/(https?:\/\/|www\.|bit\.ly|t\.cn|tinyurl\.com)/i.test(content)) {
    return { ok: false, message: "留言板不展示外部推广链接。" };
  }
  if (/(?:\b1[3-9]\d{9}\b|\b\d{3,4}[-\s]\d{7,8}\b)/u.test(content)) {
    return { ok: false, message: "留言不展示电话号码等联系方式。" };
  }
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(content + " " + nickname))) {
    return { ok: false, message: "留言未通过内容审核，未予展示。" };
  }

  return { ok: true, nickname, content };
}

export const BOARD_LIMITS = {
  maxContentLength: MAX_CONTENT_LENGTH,
  maxNicknameLength: MAX_NICKNAME_LENGTH,
};
