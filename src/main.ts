import { BrowserWindow, ipcMain } from "electron";
import HavesterWindow, {
  HarvesterPool,
  SolvedCaptchas,
} from "./backend/harvesters/Harvester";
import { SocketServer, startNewServer } from "./backend/server/Websockets";

// #TODO change the port number of the websocket to your desired port
let port: number = 2222;

export default class Main {
  static mainWindow: BrowserWindow;
  static application: Electron.App;
  static BrowserWindow;

  private static onWindowAllClosed() {
    if (process.platform !== "darwin") {
      Main.application.quit();
    }
  }

  private static onClose() {
    // Dereference the window object.
    Main.mainWindow = null;
  }

  private static async onReady() {
    Main.mainWindow = new Main.BrowserWindow({
      width: 800,
      height: 600,
      show: false, // Keeps the window hidden
      skipTaskbar: true, // Hides it from the taskbar
      focusable: false, // Prevents the window from receiving focus
    });

    await startNewServer(port);
    SocketServer.startServer();

    HarvesterPool.push(
      new HavesterWindow({
        SessionID: "fdfnsiudfn8sdfiosnd",
        Attributes: {
          Checkpoint: true,
          V2: true,
          V3: false,
        },
        Name: "First Harvester",
        InUse: false,
      })
    );

    HarvesterPool.push(
      new HavesterWindow({
        SessionID: "0-ifsdfndsciubn",
        Attributes: {
          Checkpoint: false,
          V2: true,
          V3: false,
        },
        Name: "Second Harvester",
        InUse: false,
      })
    );

    HarvesterPool.push(
      new HavesterWindow({
        SessionID: "mfd90sdfsd-fsdf",
        Attributes: {
          Checkpoint: false,
          V2: true,
          V3: true,
        },
        Name: "Third Harvester",
        InUse: false,
      })
    );

    HarvesterPool.forEach(function (harvester) {
      harvester.openHarvester();
    });

    Main.mainWindow.on("closed", Main.onClose);
  }

  static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
    // we pass the Electron.App object and the
    // Electron.BrowserWindow into this function
    // so this class has no dependencies. This
    // makes the code easier to write tests for
    Main.BrowserWindow = browserWindow;
    Main.application = app;
    Main.application.on("window-all-closed", Main.onWindowAllClosed);
    Main.application.on("ready", Main.onReady);
  }
}

ipcMain.on("sendCaptcha", function (_event, token, taskid) {
  console.log(`received token for ${taskid}`);
  SolvedCaptchas.set(taskid, token);
  SocketServer.sendMessage({
    action: "completed",
    message: "completed a captcha",
    solved: { Success: true, Token: token, Taskid: taskid },
    openHarvesters: [],
  });
});
