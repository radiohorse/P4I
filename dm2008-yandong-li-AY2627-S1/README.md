# DM2008 - Yandong Li

**Course:** DM2008: Programming for Interaction<br>
**Academic Year:** AY2026/27 Semester 1<br>
**Nanyang Technological University, Singapore**

## About This Repo

This is my work for DM2008 during my exchange at NTU. I explored drawing, motion, sound and physical inputs, with a focus on how an interaction feels.

## Contents

| Folder | What's inside |
| --- | --- |
| [01 - Activities](01-activities/) | Weekly p5.js exercises and Arduino experiments. |
| [02 - Mini Project](02-mini-project/) | Pong with music-reactive visuals and my own soundtrack. |
| [03 - Sensor Jam](03-sensor-jam/) | An ultrasonic sensor connected to p5.js through Web Serial. |
| [04 - Final Project](04-final-project-ambient-hands/) | Ambient Hands, a gesture-controlled ambient instrument. |

## Project Highlights

### Ambient Hands

I used hand tracking to play ambient music. The left hand controls a Pad and the right hand controls a Bell. Position changes the notes, openness controls volume, and distance changes reverb.

![Ambient Hands interface with a 24-zone pitch grid and two hand markers](04-final-project-ambient-hands/work/single-file-preview.png)

[Project notes](04-final-project-ambient-hands/README.md) / [Sketch](04-final-project-ambient-hands/index.html)

### Pong by Dong

I made a Pong variation with soft trails and a light blue palette. FFT analysis changes the ball's size and colour to my own track, *Luminous Dance*. I also added a start menu and a game over screen.

![Pong gameplay with a blue ball and fading trails](<02-mini-project/documentation/Pong by Dong.gif>)

[Source](<02-mini-project/Yandong Li DM2008 Mini Project (Pong) copy_2026_09_25_06_24_11/>) / [Video demo](https://www.youtube.com/watch?v=Mx5z4Iru7pg)

### Sensor Jam

I mapped ultrasonic distance readings to the size and colour of a circle and rectangles. Smoothing makes the visual changes less abrupt.

![A green circle and purple rectangles responding to distance readings](01-activities/week-09/documentation/02.png)

[Sketch](03-sensor-jam/index.html) / [Arduino code](01-activities/week-09/Activity_9a/9a.ino)

## Weekly Activities

| Week | Focus |
| --- | --- |
| [01](01-activities/week-01/README.md) | Drawing with code; simple creatures, lines and circles. |
| [02](01-activities/week-02/README.md) | Conditions, loops and repeating patterns. |
| [03](01-activities/week-03/README.md) | Arrays, functions and overlapping shapes. |
| [04](01-activities/week-04/README.md) | Classes, objects and moving agents. |
| [05](01-activities/week-05/README.md) | Vectors and collision responses. |
| [08](01-activities/week-08/README.md) | LEDs, light, pressure and distance sensors. |
| [09](01-activities/week-09/README.md) | Sensor mapping, smoothing and Web Serial. |

## Running the Sketches

Serve the repository with VS Code Live Server, then open a sketch's `index.html` through the server.

- **Ambient Hands:** allow camera access and click the play icon to enable audio. The hand model needs an internet connection on first load.
- **Pong:** click to start. Use W/S for the left paddle and the arrow keys for the right paddle.
- **Sensor Jam:** upload the Week 09 Arduino sketch, close Serial Monitor, then open the sketch in Chrome or Edge and click **Connect to Arduino**.

---

_For teaching and learning purposes. Coursework by Yandong Li._
