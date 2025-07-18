import { MathUtils } from 'three';

/**
 * Set up slider and button controls for joint angles.
 * This function links UI elements to robot joint states.
 * @param {Object} robot - The robot instance from URDFLoader.
 */
export function setupSliderButtonControls(robot) {
  const jointNames = Object.keys(robot.joints)
    .filter(name => robot.joints[name].jointType !== 'fixed');

  document.querySelectorAll('.joint-row').forEach(row => {
    const index = parseInt(row.dataset.jointIndex);
    const slider = row.querySelector('.joint-slider');
    const display = row.querySelector('.angle-display');
    const buttons = row.querySelectorAll('.control-btn');

    slider.addEventListener('input', () => {
      const angleDeg = parseFloat(slider.value);
      display.textContent = `${angleDeg}°`;
      if (index < jointNames.length) {
        const joint = robot.joints[jointNames[index]];
        joint.setJointValue(MathUtils.degToRad(angleDeg));
        robot.updateMatrixWorld(true);
      }
    });

    buttons.forEach(btn => {
      const key = btn.dataset.key;
      btn.addEventListener('click', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }));
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent('keyup', { key }));
        }, 80);
      });
    });
  });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const btn = document.querySelector(`.control-btn[data-key="${key}"]`);
    if (btn) btn.classList.add('pressed');
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const btn = document.querySelector(`.control-btn[data-key="${key}"]`);
    if (btn) btn.classList.remove('pressed');

    const mapping = { '1': 0, 'q': 0, '2': 1, 'w': 1, '3': 2, 'e': 2 };
    const index = mapping[key];

    if (index !== undefined && index < jointNames.length) {
      const joint = robot.joints[jointNames[index]];
      const angle = Math.round(MathUtils.radToDeg(joint.angle));
      const row = document.querySelector(`.joint-row[data-joint-index="${index}"]`);
      if (row) {
        row.querySelector('.joint-slider').value = angle;
        row.querySelector('.angle-display').textContent = `${angle}°`;
      }
    }
  });
}