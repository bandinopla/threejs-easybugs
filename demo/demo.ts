import {
	HemisphereLight,
	Light,
	Mesh,
	PerspectiveCamera,
	PMREMGenerator,
	Scene,
} from "three/webgpu";
import { GLTFLoader, RoomEnvironment } from "three/examples/jsm/Addons.js";
import { saturation, texture } from "three/tsl";
import {
	AnimationMixer,
	Color,
	DirectionalLight,
	MeshPhysicalNodeMaterial,
	Object3D,
	WebGPURenderer,
} from "three/webgpu";
import { BugRig } from "threejs-easybugs";
import { InstancedAnimatedMesh } from "threejs-instancedanimatedmesh";
//import { CustomBehaviourExample } from "./CustomBehaviourExample";

export async function demo(
	scene: Scene,
	camera: PerspectiveCamera,
	renderer: WebGPURenderer,
	ldr: GLTFLoader,
) {
	const TOTAL_COUNT = 20;

	const [manAssets, roachAssets] = await Promise.all([
		ldr.loadAsync("./man.packed.glb"),
		ldr.loadAsync("./roach.packed.glb"),
	]);

	const bgColor = new Color("darkgrey");
	scene.background = bgColor;

	scene.add(new HemisphereLight(0, "#ffffff", 1));
	//scene.add(new AmbientLight(0xffffff, 0.3));

	const shadowRes = 512 * 2;

	const dirLight = new DirectionalLight(0xffffff, 2);
	dirLight.position.set(0, 0.3, -6);
	dirLight.castShadow = true;
	dirLight.shadow.mapSize.width = shadowRes;
	dirLight.shadow.mapSize.height = shadowRes;
	dirLight.shadow.camera.near = 0.1;
	dirLight.shadow.camera.far = 11;

	const range = 2;
	dirLight.shadow.camera.left = -range;
	dirLight.shadow.camera.right = range;
	dirLight.shadow.camera.top = range;
	dirLight.shadow.camera.bottom = -range;
	dirLight.shadow.bias = -0.0001;
	scene.add(dirLight);

	const pmremGenerator = new PMREMGenerator(renderer);
	scene.environment = pmremGenerator.fromScene(
		new RoomEnvironment(),
		0.11,
	).texture;
	scene.environmentIntensity = 0.3;

	const dirLight2 = new DirectionalLight(0xddffff, 1);
	dirLight2.position.set(-3, 4, 6);
	dirLight2.castShadow = true;
	dirLight2.shadow.mapSize.width = shadowRes;
	dirLight2.shadow.mapSize.height = shadowRes;
	dirLight2.shadow.camera.near = 0.5;
	dirLight2.shadow.camera.far = 10;
	dirLight2.shadow.camera.left = -range;
	dirLight2.shadow.camera.right = range;
	dirLight2.shadow.camera.top = range;
	dirLight2.shadow.camera.bottom = -range;
	dirLight2.shadow.bias = -0.0001;
	scene.add(dirLight2);

	camera.fov = 20;
	camera.updateProjectionMatrix();
	camera.position.set(0, 0.5, 8);

	//scene.add(sceneAssets.scene);
	//scene.add(manAssets.scene);

	let stickto: Object3D[] = [];
	manAssets.scene.traverse((o) => {
		if (o instanceof Light) {
			//o.intensity = 1;
		} else if (o instanceof Mesh) {
			o.castShadow = true;
			o.receiveShadow = true;

			//o.material.normalMap = undefined;
		}
		if (o.userData.atlas) {
			o.visible = false;
		} else if (o.userData.stickto) {
			stickto.push(o);
		}
	});

	stickto.forEach((o) => {
		const target = manAssets.scene.getObjectByName(
			o.userData.stickto as string,
		);
		if (target) {
			target.attach(o);
		}
	});

	scene.add(manAssets.scene);

	//---------

	const dome = scene.getObjectByName("bug-dome")!;
	const faceHit = scene.getObjectByName("face-hit")! as Mesh;
	faceHit.layers.set(2);
	faceHit.geometry.computeBoundsTree();

	const roachRig = roachAssets.scene.getObjectByName("roach-rig")!;

	roachAssets.scene.traverse((o) => {
		if (o instanceof Mesh) {
			o.material = new MeshPhysicalNodeMaterial({
				colorNode: saturation(texture(o.material.map!).mul(0.5), 0.9),
				roughness: 0.6,
				ior: 1.4,
			});
		}
	});

	const imesh = new InstancedAnimatedMesh(
		roachRig,
		roachAssets.animations, // AnimationClip[]
		TOTAL_COUNT, // how many to create
	);

	scene.add(imesh);
	imesh.castShadow = true;
	imesh.receiveShadow = true;

	let bugRigs: BugRig[] = [];

	//
	// create the roaches
	//
	for (let i = 0; i < TOTAL_COUNT; i++) {
		const body = imesh.getInstance();
		body.gotoAndPlay("idle");
		body.gotoAndPlay("antenas", { channel: "antenas" });
		body.gotoAndPlay("alas-guardadas", { channel: "wings" });
		//body.scale.setScalar(0.08);

		const randomFlyAttempt = () => {
			setTimeout(
				() => {
					if (body.visible) {
						console.log("PLAY WINGS");
						body.gotoAndStop("alas-locas", {
							channel: "wings",
							timeScale: 2 + Math.random() * 2,
							frameScript: {
								$complete: () => {
									console.log("WINGS COMPLETE");
									body.gotoAndPlay("alas-guardadas", {
										channel: "wings",
									});

									setTimeout(() => {
										randomFlyAttempt();
									}, 4300);
								},
							},
						});
					} else {
						randomFlyAttempt();
					}
				},
				1100 + Math.random() * 5000,
			);
		};

		randomFlyAttempt();

		body.scale.setScalar(0.04 + Math.random() * 0.04);
		body.visible = i == 0;

		scene.add(body);

		const bug = new BugRig(body, {
			collisionLayer: 2,
		});
		bug.setRaycastCage(dome, "dome");
		bug.placeAtRandomPosition();
		bug.setupLegsIK({
			rig: roachRig,
			legs: [
				{
					goal: "legAfootGoal.L",
					foot: "legAfoot.L",
					chainLength: 3,
					mirror: true,
				},
				{
					goal: "legAfootgoal.L.001",
					foot: "legAfoot.L.001",
					chainLength: 3,
					mirror: true,
				},
				{
					goal: "legAfootgoal.L.002",
					foot: "legAfoot.L.002",
					chainLength: 3,
					mirror: true,
				},
			],
			iterations: 13,
			stepTransitionDuration: 0.1,
			footMaxDistanceFromGoal: 0.01,
		});

		// **** this is how you set a random behaviour *** //
		//bug.behaviour = new CustomBehaviourExample();

		body.modifyPose(() => {
			bug.syncLegsIK();
		});

		//dome.add(new AxesHelper());

		faceHit.parent?.attach(bug.body);
		bugRigs.push(bug);
	}

	//
	// rig of the man
	//
	const rig = scene.getObjectByName("rig")!;
	const mixer = new AnimationMixer(rig);
	const action = mixer.clipAction(manAssets.animations[0]);
	action.play();

	//
	// Inspector panel
	//
	const params = {
		amount: 1,
	};
	const settings = renderer.inspector.createParameters("Demo Settings");

	settings
		.add(params, "amount", 1, TOTAL_COUNT, 1)
		.name("Count")
		.onChange((newVal) => {
			for (let i = 0; i < TOTAL_COUNT; i++) {
				bugRigs[i].body.visible = i < newVal;
			}
		});

	let lastTime = 0;

	return (elapsed: number) => {
		const dt = elapsed - lastTime;
		lastTime = elapsed;

		bugRigs.forEach((bug, i) => {
			if (bug.body.visible) {
				bug.update(dt, false);
			}
		});

		mixer.update(dt);
		//body.needsUpdate = true;
		imesh.update(dt, renderer);
	};
}
