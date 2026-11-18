import {
  BlobSource,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MATROSKA,
  MP4,
  Mp4OutputFormat,
  Output,
  WEBM,
} from "mediabunny";

// MediaRecorder creates fragmented MP4. Copy the H.264 packets into a
// seekable MP4 with a complete sample table at the beginning of the file.
export async function finalizeVideo(blob, limitedRange = false) {
  if (!blob.size) throw new Error("The encoder returned an empty recording.");
  const input = new Input({ source: new BlobSource(blob), formats: [MP4, MATROSKA, WEBM] });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("The recording contains no video track.");
    const packets = new EncodedPacketSink(track);
    const first = await packets.getFirstPacket();
    if (!first || first.type !== "key" || !await packets.getNextPacket(first)) {
      throw new Error("The recording contains too few frames.");
    }
    if (blob.type === "video/webm") return blob;
    const decoderConfig = await track.getDecoderConfig();
    if (await track.getCodec() !== "avc" || !decoderConfig?.description) {
      throw new Error("The recording contains no H.264 configuration.");
    }
    if (limitedRange) {
      decoderConfig.colorSpace = {
        primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false,
      };
    }
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const video = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(video);
    await output.start();
    try {
      let metadata = { decoderConfig };
      for await (const packet of packets.packets()) {
        await video.add(packet, metadata);
        metadata = undefined;
      }
      video.close();
      await output.finalize();
      return new Blob([target.buffer], { type: "video/mp4" });
    } catch (error) {
      await output.cancel();
      throw error;
    }
  } finally {
    input.dispose();
  }
}
