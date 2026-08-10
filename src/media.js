import { spawn } from "node:child_process";

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    const out = [], err = [];
    p.stdout.on("data", c => out.push(c));
    p.stderr.on("data", c => err.push(c));
    p.on("error", reject);
    p.on("close", code => code === 0
      ? resolve(Buffer.concat(out))
      : reject(new Error(Buffer.concat(err).toString().slice(-2000))));
    p.stdin.end(input);
  });
}

export function toPcm24k(input) {
  return ffmpeg([
    "-hide_banner","-loglevel","error","-i","pipe:0",
    "-f","s16le","-ac","1","-ar","24000","pipe:1"
  ], input);
}

export function pcmToOgg(pcm) {
  return ffmpeg([
    "-hide_banner","-loglevel","error",
    "-f","s16le","-ar","24000","-ac","1","-i","pipe:0",
    "-c:a","libopus","-b:a","32k","-vbr","on","-application","voip",
    "-f","ogg","pipe:1"
  ], pcm);
}

export function imageToJpeg(input) {
  return ffmpeg([
    "-hide_banner","-loglevel","error","-i","pipe:0",
    "-frames:v","1","-vf","scale='min(1600,iw)':-2",
    "-q:v","5","-f","image2","-vcodec","mjpeg","pipe:1"
  ], input);
}
