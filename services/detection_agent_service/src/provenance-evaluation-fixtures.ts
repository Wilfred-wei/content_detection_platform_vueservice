import type { AigcMarker, MetadataAuthenticationResult } from "./metadata-inspector.js";

export type EvaluationAigcFixtureMode = "unsigned" | "controlled_authenticated";

export function createEvaluationAigcMarker(
  mode: EvaluationAigcFixtureMode,
  overrides: Partial<AigcMarker> = {},
): AigcMarker {
  return {
    Label: "1",
    ContentProducer: "Content Detection Test",
    ProduceID: mode === "controlled_authenticated" ? "eval-auth-001" : "eval-unsigned-001",
    ReservedCode1: mode === "controlled_authenticated" ? "controlled-test-signature" : "",
    ContentPropagator: "Content Detection Test",
    PropagateID: mode === "controlled_authenticated" ? "eval-auth-001" : "eval-unsigned-001",
    ReservedCode2: "",
    ...overrides,
  };
}

export function jpegWithEvaluationAigcXmp(baseJpeg: Buffer, marker: AigcMarker): Buffer {
  if (baseJpeg.length < 2 || baseJpeg[0] !== 0xff || baseJpeg[1] !== 0xd8) {
    throw new Error("INVALID_EVALUATION_BASE_JPEG");
  }
  const escapedJson = JSON.stringify({ AIGC: marker })
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:aigc="urn:gb:45438:2025" aigc:AIGC="${escapedJson}"/></rdf:RDF></x:xmpmeta>`;
  const payload = Buffer.concat([
    Buffer.from("http://ns.adobe.com/xap/1.0/\0", "ascii"),
    Buffer.from(xml, "utf8"),
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    baseJpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    length,
    payload,
    baseJpeg.subarray(2),
  ]);
}

export function controlledEvaluationMetadataAuthentication(): MetadataAuthenticationResult {
  return {
    signatureValidated: true,
    contentBindingValidated: true,
    issuerTrusted: true,
    issuer: "Controlled Evaluation Issuer",
  };
}
