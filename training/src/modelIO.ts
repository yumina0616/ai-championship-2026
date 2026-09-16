// @tensorflow/tfjs(순수 JS, node 백엔드 아님)에는 Node용 file:// IOHandler가 없어서
// model.save('file://...')/tf.loadLayersModel('file://...')를 직접 쓸 수 없다.
// 대신 표준 브라우저 포맷(model.json + weights.bin)을 손으로 써서, 나중에 브라우저의
// tf.loadLayersModel('/model/model.json')이 그대로 읽을 수 있게 한다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as tf from "@tensorflow/tfjs";

export async function saveModelToDisk(model: tf.LayersModel, modelJsonPath: string): Promise<void> {
  let artifacts: tf.io.ModelArtifacts | undefined;
  await model.save(
    tf.io.withSaveHandler(async (a) => {
      artifacts = a;
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON" } };
    })
  );
  if (!artifacts) throw new Error("saveModelToDisk: withSaveHandler가 artifacts를 받지 못했습니다.");

  const weightsFileName = "weights.bin";
  const modelJson = {
    modelTopology: artifacts.modelTopology,
    format: artifacts.format,
    generatedBy: artifacts.generatedBy,
    convertedBy: artifacts.convertedBy,
    weightsManifest: [{ paths: [weightsFileName], weights: artifacts.weightSpecs }],
  };

  mkdirSync(dirname(modelJsonPath), { recursive: true });
  writeFileSync(modelJsonPath, JSON.stringify(modelJson));
  const weightsPath = `${dirname(modelJsonPath)}/${weightsFileName}`;
  const weightData = artifacts.weightData;
  if (Array.isArray(weightData)) {
    throw new Error("saveModelToDisk: weightData가 다중 shard로 나뉘어 있습니다(예상 못 한 형태).");
  }
  writeFileSync(weightsPath, Buffer.from(weightData as ArrayBuffer));
}

export async function loadModelFromDisk(modelJsonPath: string): Promise<tf.LayersModel> {
  const modelJson = JSON.parse(readFileSync(modelJsonPath, "utf8"));
  const weightsPath = `${dirname(modelJsonPath)}/${modelJson.weightsManifest[0].paths[0]}`;
  const weightData = readFileSync(weightsPath);
  const arrayBuffer = weightData.buffer.slice(
    weightData.byteOffset,
    weightData.byteOffset + weightData.byteLength
  );

  const artifacts: tf.io.ModelArtifacts = {
    modelTopology: modelJson.modelTopology,
    format: modelJson.format,
    generatedBy: modelJson.generatedBy,
    convertedBy: modelJson.convertedBy,
    weightSpecs: modelJson.weightsManifest[0].weights,
    weightData: arrayBuffer,
  };
  return tf.loadLayersModel(tf.io.fromMemory(artifacts));
}
