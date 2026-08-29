import { Demo } from "./demo.js";

const canvas = document.querySelector("#glCanvas");

if (canvas) {
  window.pomodorousPlayground = new Demo(canvas, false, {
    shared: false,
    modelId: 148
  });
}
