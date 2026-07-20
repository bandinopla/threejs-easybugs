import { Object3D, Vector3 } from "three";
import { BugBehaviour } from "./BugBehaviour";

export class RandomWalkingBug extends BugBehaviour {
	protected override calculateNextStepFor(
		body: Object3D,
		nextStep: Vector3,
	): void {
		let reach = 3;

		nextStep.set(0, 0, 3);

		nextStep.x += (Math.random() - 0.5) * 2 * reach;
		//nextStep.y += (Math.random() - 0.5) * 2 * reach;
	}
}
