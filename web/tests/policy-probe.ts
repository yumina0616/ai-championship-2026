// Vite가 실제 앱과 같은 TF 인스턴스를 해석하는 브라우저 테스트 진입점.
import * as tf from "@tensorflow/tfjs";
import { ParkingEngine } from "../../engine/src/index";
import { makeScenario } from "../src/driving";
import { loadPolicy } from "../src/policy";

export async function probe() {
  const scenario = makeScenario("open"),
    engine = new ParkingEngine();
  let observation = engine.reset(scenario);
  const policy = await loadPolicy(scenario, new AbortController().signal);
  const before = tf.memory().numTensors;
  let steps = 0,
    moved = false,
    terminated = false;
  try {
    for (; steps < 1801; steps++) {
      const next = engine.step(policy.predict(observation));
      moved ||= Math.abs(next.observation.speedMps) > 0.01;
      observation = next.observation;
      if (next.outcome.terminated) {
        terminated = true;
        break;
      }
    }
    const stable = tf.memory().numTensors === before;
    policy.dispose();
    return {
      moved,
      stable,
      steps,
      terminated,
      disposed: tf.memory().numTensors < before,
    };
  } catch (error) {
    policy.dispose();
    throw error;
  }
}
