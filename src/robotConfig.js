/**
 * Configuration settings for different robot models.
 */
const robotConfigs = {
  mt4: {
    name: 'mt4',
    type: 'arm',
    servos: {
      arm: 3  // Three movable joints
    },
    viewConfig: {
      camera: {
        position: [1, 1, 1],  // Initial camera position
        rotation: [0, 0, 0],  // Camera orientation [pitch, yaw, roll] in degrees
        fov: 30,              // Field of view
        zoom: 10.0            // Zoom level
      },
      defaultDistance: 3,    // Default OrbitControls distance
      minDistance: 0.1,      // Minimum zoom distance
      maxDistance: 10        // Maximum zoom distance
    },
    controlMapping: {
      arm: {
        type: 'default',
        keyMapping: {
          '1': { jointIndex: 0, direction: 1 },
          'q': { jointIndex: 0, direction: -1 },
          '2': { jointIndex: 1, direction: 1 },
          'w': { jointIndex: 1, direction: -1 },
          '3': { jointIndex: 2, direction: 1 },
          'e': { jointIndex: 2, direction: -1 }
        }
      }
    }
  }
};

export default robotConfigs;
