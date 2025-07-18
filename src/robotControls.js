import { MathUtils } from 'three';

/**
 * Setup keyboard controls for virtual robot joint animation.
 * @param {Object} robot - Robot object loaded by URDFLoader.
 * @returns {Function} Update function to be called in render loop.
 */
export function setupKeyboardControls(robot) {
  const keyState = {};

  // Key down listener
  window.addEventListener('keydown', (e) => {
    keyState[e.key.toLowerCase()] = true;
  });

  // Key up listener
  window.addEventListener('keyup', (e) => {
    keyState[e.key.toLowerCase()] = false;
  });

  const stepSize = MathUtils.degToRad(1); // Step size per joint update (radians)

  const jointNames = robot && robot.joints
    ? Object.keys(robot.joints).filter(name => robot.joints[name].jointType !== 'fixed')
    : [];

  // Update joints in render loop
  return function updateJoints() {
    if (!robot || !robot.joints) return;

    const mappings = {
      '1': { index: 0, dir: 1 },
      'q': { index: 0, dir: -1 },
      '2': { index: 1, dir: 1 },
      'w': { index: 1, dir: -1 },
      '3': { index: 2, dir: 1 },
      'e': { index: 2, dir: -1 }
    };

    Object.entries(mappings).forEach(([key, { index, dir }]) => {
      if (keyState[key] && index < jointNames.length) {
        const jointName = jointNames[index];
        const joint = robot.joints[jointName];
        const current = joint.angle;
        const next = current + dir * stepSize;

        if (joint.jointType !== 'fixed' && next >= joint.limit.lower && next <= joint.limit.upper) {
          joint.setJointValue(next);
          robot.updateMatrixWorld(true);
        }
      }
    });
  };
}

/**
 * Placeholder function without real servo control logic.
 */
export function setupControlPanel() {
  // Interface placeholder only
}
