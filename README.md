# MT4 Robotic Arm Playground

A web-based playground for the MT4 robotic arm—drive joints in real time from your browser.  
Inspired by [Bambot](https://github.com/timqian/bambot) / [bambot.org](https://bambot.org), this repo shows how to:

- Load a URDF model of the MT4 arm  
- Render it in Three.js with OrbitControls  
- Map keyboard keys `1/Q`, `2/W`, `3/E` to three joint axes  
- Stream commands over WebSockets (or HTTP) to your hardware bridge  

### ⚙️ Features

- **Live joint control** via keyboard  
- **Modular config** (camera, joint limits, key mappings)  
- **Zero-dependency client**: just HTML/CSS/JS  

### 🚀 Quick Start

1. Clone the dev branch:  
   ```bash
   git clone -b dev https://github.com/orionplan/MT4-Robotic-Arm-Playground.git
   cd MT4-Robotic-Arm-Playground
    ```
2.	Install & serve:
    ```bash
    npm install
    npm run dev
    ```
3.	Open http://localhost:xxxx in your browser and press 1/Q, 2/W, 3/E to move joints.

    🛠️ How It Works
    - Three.js renders the URDF model.
    - Keyboard events update joint angles.
    - A WebSocket or HTTP layer relays commands to your embedded controller.