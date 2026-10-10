import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/cyrillic-400.css";
import "./app/styles.css";
import { AppController } from "./app/controller";
import { RenderScheduler } from "./visualizers/scheduler";
import { App } from "./app/App";
const controller = new AppController();
const scheduler = new RenderScheduler(controller.audio);
const root = createRoot(document.getElementById("root")!);
root.render(<App controller={controller} scheduler={scheduler} />);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    scheduler.destroy();
    controller.destroy();
    root.unmount();
  }
});
if (import.meta.env.DEV) {
  Object.assign(window, { visualizer: { controller, scheduler } });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      scheduler.destroy();
      controller.destroy();
      root.unmount();
    });
}
