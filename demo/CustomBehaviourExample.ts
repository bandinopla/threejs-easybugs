import { Object3D, Vector3 } from "three";
import { BugBehaviour } from "threejs-easybugs";

export class CustomBehaviourExample extends BugBehaviour {
	protected override calculateNextStepFor(
		body: Object3D,
		nextStep: Vector3,
	): void {
		nextStep.set(1, 0, 3);
	}
}
