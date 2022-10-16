import { BrowserWindow, ipcMain } from "electron";
import HavesterWindow, {
  HarvesterPool,
  HarvesterRequest,
  locateOpenHarvester,
  SolvedCaptchas,
} from "./harvesters/Harvester";
import express from "express";

const port = 2000;
const server = express();

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
    Main.mainWindow = new Main.BrowserWindow({ width: 800, height: 600 });
    //Main.mainWindow
    //    .loadURL('file://' + __dirname + '/index.html');

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

    /*
    const solveCaptcha = await HarvesterPool[1].solveCapcha({
      siteURL: "https://recaptcha-demo.appspot.com/recaptcha-v2-invisible.php",
      siteKey: "6LcmDCcUAAAAAL5QmnMvDFnfPTP4iCUYRk2MwC0-",
      taskId: "4rwef-wfefwef-w4fsdfji",
      captchaTypes: {
        V2: true,
        Checkpoint: false,
        V2Invisible: false,
        V3: false,
        V3Enterprise: false,
      },
    });

    console.log(solveCaptcha);
    */
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
});

server.get("/fetch", function (req: any, res: any) {
  console.log("new request to the server");
  try {
    let captchaRequest: HarvesterRequest = {
      siteURL: "",
      siteKey: "",
      taskId: "",
      captchaTypes: {
        V2: true,
        Checkpoint: false,
        V2Invisible: false,
        V3: false,
        V3Enterprise: false,
      },
    };
    console.log(
      `Received request for: ${req.query.siteurl},${req.query.sitekey},${req.query.taskid},${req.query.type}`
    );
    captchaRequest.siteKey = req.query.sitekey.toString();
    captchaRequest.siteURL = req.query.siteurl.toString();
    captchaRequest.taskId = req.query.taskid.toString();
    switch (req.query.type.toString()) {
      case "checkpoint":
        captchaRequest.captchaTypes.Checkpoint = true;
        break;
      case "v2":
        captchaRequest.captchaTypes.V2 = true;
        break;
      case "v2-invisible":
        captchaRequest.captchaTypes.V2Invisible = true;
        break;
      case "v3":
        captchaRequest.captchaTypes.V3 = true;
        break;
      case "v3-enterprise":
        captchaRequest.captchaTypes.V3Enterprise = true;
        break;
      default:
        return res.json({
          success: false,
          error: "no captcha type specified",
        });
    }
    console.log(`will request captcha`);
    locateOpenHarvester(captchaRequest).then(
      (f) => {
        return res.json(f);
      }
    );
  } catch (e) {
    console.log(`error solving captcha ${e}`);
    return res.json({ success: false, error: e });
  }
});

server.listen(port);

