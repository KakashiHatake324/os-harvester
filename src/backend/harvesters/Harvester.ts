import { BrowserWindow, net, session } from "electron";
import { readFileSync } from "fs";
import { SocketServer } from "../server/Websockets";
export var HarvesterPool: HavesterWindow[] = [];
export let SolvedCaptchas = new Map<string, string>();

// Harvester class
export default class HavesterWindow {
  public Information: HarvesterStruct;
  private harvesterWindow: BrowserWindow;
  private IsIntercepting: boolean;
  private captchaSession: Electron.Session;

  constructor(harvester: HarvesterStruct) {
    this.Information = harvester;
  }

  // Open the harvester
  async openHarvester() {
    if (!this.harvesterWindow) {
      this.harvesterWindow = new BrowserWindow({
        title: this.Information.Name,
        width: 360,
        height: 550,
        maxHeight: 550,
        maxWidth: 360,
        minHeight: 550,
        minWidth: 360,
        darkTheme: true,
        show: false,         // Keeps the window hidden
        skipTaskbar: true,   // Hides it from the taskbar
        focusable: false,    // Prevents the window from receiving focus      
        webPreferences: {
          allowRunningInsecureContent: true,
          session: session.fromPartition(
            `persist:${this.Information.SessionID}`
          ),
          nodeIntegration: true,
          contextIsolation: false,
          nodeIntegrationInSubFrames: true,
          nodeIntegrationInWorker: true,
          webSecurity: false,
          plugins: true,
        },
      });
      console.log(`opened harvester ${this.Information.Name}`);
      this.captchaSession = this.harvesterWindow.webContents.session;
      /*
      this.captchaSession.webRequest.onBeforeSendHeaders(
        (details, callback) => {
          details.requestHeaders["User-Agent"] =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
          callback({
            requestHeaders: details.requestHeaders,
          });
        }
      );
      */
      this.harvesterWindow.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36");
      await this.reset();
    } else {
      console.log(
        `This harvester is already open bruh: ${this.Information.Name}`
      );
    }
  }

  // Use the harvester to solve a captcha
  async solveCapcha(task: HarvesterRequest): Promise<HarvesterResponse> {
    this.Information.InUse = true;
    if(task.proxy && task.proxy !== '') await this.setTempProxy(task.proxy);
    let token: string;
    let captchaHTML: Buffer;
    if (this.IsIntercepting) {
      this.harvesterWindow.webContents.session.protocol.uninterceptProtocol(
        "https"
      );
    }
    
    this.harvesterWindow.show();
    
    console.log(`solving captcha on harvester ${this.Information.Name}`);

    try {
      if (task.captchaTypes.Checkpoint) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
      } else if (task.captchaTypes.V2) {
        captchaHTML = this.genV2HTML(task.siteKey, task.taskId);
      } else if (task.captchaTypes.V2Invisible) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
      } else if (task.captchaTypes.V3) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
      } else if (task.captchaTypes.V3Enterprise) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
      } else {
        return { Success: false, Token: "", Taskid: task.taskId };
      }

      console.log(`created the html`);

      this.IsIntercepting =
        this.harvesterWindow.webContents.session.protocol.interceptBufferProtocol(
          "https",
          (request, callback) => {
            if (request.url === task.siteURL) {
              console.log("injecting that mf", request.url);
              this.harvesterWindow.webContents.session.protocol.uninterceptProtocol(
                "https"
              );
              callback({ mimeType: "text/html", data: captchaHTML });
            } else {
              const req = net.request(request);
              req.on("response", (res) => {
                const chunks: any = [];

                res.on("data", (chunk) => {
                  chunks.push(Buffer.from(chunk));
                });

                res.on("end", async () => {
                  const file = Buffer.concat(chunks);
                  callback(file);
                });
              });

              if (request.uploadData) {
                request.uploadData.forEach((part) => {
                  if (part.bytes) {
                    req.write(part.bytes);
                  } else if (part.file) {
                    req.write(readFileSync(part.file));
                  }
                });
              }
              req.end();
            }
          }
        );

      console.log(`setting up the intercept`);

      await this.harvesterWindow.loadURL(task.siteURL);

      while (this.IsIntercepting) {
        let complete = await this.checkComplete(task.taskId);
        if (complete) {
          token = SolvedCaptchas.get(task.taskId);
          SolvedCaptchas.delete(task.taskId);
          break;
        }
        await delay(3000);
      }
    } catch (e) {
      console.log(`error solving the captcha ${e}`);
    } finally {
      this.Information.InUse = false;
      this.IsIntercepting = false;
      this.harvesterWindow.webContents.session.protocol.uninterceptProtocol(
        "https"
      );
      await this.reset();
      if (!token) {
        return { Success: false, Token: "", Taskid: task.taskId };
      } else {
        return null;
      }
    }
  }

  getAttributes(): HarvesterType {
    return this.Information.Attributes;
  }

  // Return if the harvester is closed
  inUse(): boolean {
    return this.Information.InUse;
  }

  // Return the harvester's session id
  getSession(): string {
    return this.Information.SessionID;
  }

  setUse(): string {
    this.Information.InUse = true;
    return this.Information.SessionID;
  }

  public async setTempProxy(newProxy: string): Promise<void> {
    const formatedProxy = formatProxy(newProxy);
    await this.captchaSession
      .setProxy({ proxyRules: formatedProxy.url })
      .catch((e) => {
        console.log("error setting proxy", e);
      })
      .then(() => {
        console.log("proxy was set");
      });

      this.harvesterWindow.webContents.on('login', (_e, _details, _authInfo, callback) => {
        callback(formatedProxy?.auth?.username || '', formatedProxy?.auth?.password || '')
      })
  
  }

  genV2HTML(key: string, taskId: string): Buffer {
    return Buffer.from(`
    <!DOCTYPE html>
        <html lang="en">
        <head>
        <title>Recaptcha Harvester</title>
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
          <script>
            window.captcha = "";
            function captchaCallback(token) {
                window.captcha = token;
                console.log(token);
                sub(token);
              window.grecaptcha.reset();
            }
          </script>
          <style>
            .flex {
              display: flex;
            }
            .justify-center {
              justify-content: center;
            }
            .items-center {
              align-items: center;
            }
            .mt-6 {
              margin-top: 1.5rem;
            }
          </style>
        </head>
        <body>
            <div class="flex justify-center items-center mt-6">
            <div class="g-recaptcha" data-sitekey="${key}" data-callback="captchaCallback"></div>
            </div>
            <script>
            const {ipcRenderer} = require('electron')
            function sub(token) {
            ipcRenderer.send('sendCaptcha', token, '${taskId}');
            }
            </script>
          </body>
        </html>
        `);
  }

  genV2InvisibleHTML(key: string, taskId: string): Buffer {
    return Buffer.from(`
    <!DOCTYPE html>
        <html lang="en">
        <head>
        <title>Recaptcha Harvester</title>
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
          <script>
            window.captcha = "";
            function captchaCallback(token) {
                window.captcha = token;
                console.log(token);
                sub(token);
              window.grecaptcha.reset();
            }
          </script>
          <style>
            .flex {
              display: flex;
            }
            .justify-center {
              justify-content: center;
            }
            .items-center {
              align-items: center;
            }
            .mt-6 {
              margin-top: 1.5rem;
            }
          </style>
        </head>
        <body>
            <div class="flex justify-center items-center mt-6">
            <div class="g-recaptcha" data-sitekey="${key}" data-callback="captchaCallback" data-size="invisible"></div>
            </div>
            <script>
            const {ipcRenderer} = require('electron')
            function sub(token) {
            ipcRenderer.send('sendCaptcha', token, '${taskId}');
            }
            window.addEventListener('load', function () {
                grecaptcha.execute();
            })
            </script>
          </body>
        </html>
        `);
  }

  async checkComplete(taskId: string): Promise<boolean> {
    return SolvedCaptchas.has(taskId);
  }

  async reset() {
    await this.harvesterWindow.loadURL("https://www.google.com");
  }
}

// Struct for the harvester
export interface HarvesterStruct {
  Name: string;
  SessionID: string;
  Attributes: HarvesterType;
  InUse: boolean;
}

// Type of harvester
export interface HarvesterType {
  Checkpoint: boolean;
  V2: boolean;
  V3: boolean;
}

// Types of captchas the harvesters solve
export interface CaptchaTypes {
  Checkpoint: boolean;
  V2Invisible: boolean;
  V2: boolean;
  V3: boolean;
  V3Enterprise: boolean;
}

// Request a solve from a harvester
export interface HarvesterRequest {
  siteURL: string;
  siteKey: string;
  taskId: string;
  proxy: string;
  captchaTypes: CaptchaTypes;
}

// Response coming from the harvester
export interface HarvesterResponse {
  Success: boolean;
  Taskid: string;
  Token: string;
}

// Sleep function
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function solveCaptcha(request: HarvesterRequest) {
  let harvester: HavesterWindow = await locateOpenHarvester();

  while (harvester === null) {
    harvester = await locateOpenHarvester();
    await delay(500);
  }
  console.log(`Found an open harvester and will use it to solve..`);

  useHarvester(request, harvester);
}

// Locate an open harvester, set it in use and return it
export async function locateOpenHarvester(): Promise<HavesterWindow> {
  for await (const harvester of HarvesterPool) {
    if (!harvester.inUse()) {
      harvester.setUse();
      return harvester;
    }
  }
  return null;
}

// Use the harvester returned by locateOpenHarvester()
export async function useHarvester(
  task: HarvesterRequest,
  harvester: HavesterWindow
) {
  var res = await harvester.solveCapcha(task);
  if (res && !res.Success) {
    SocketServer.sendMessage({
      action: "failed",
      message: "could not solve captcha",
      solved: res,
      openHarvesters: [],
    });
  }
  console.log(res);
}

// Proxy format type
export interface IFormattedProxy {
  host: string;
  port: number;
  url: string;
  toString: (auth: boolean) => string;
  auth?: {
    username: string;
    password: string;
  };
}

export const formatProxy = (proxy: string): IFormattedProxy => {
  const [host, port, username, password] = proxy
    .trim()
    .replace(" ", "_")
    .replace(/^https?:\/\//i, "")
    .split(":");

  const haveAuth = typeof password !== "undefined";

  return {
    host,
    port: parseInt(port, 10),
    url: `http://${host}:${port}`,
    toString: (auth = true) =>
      `http://${
        auth && haveAuth ? `${username}:${password}@` : ""
      }${host}:${port}`,
    ...(haveAuth && {
      auth: { username, password },
    }),
  };
};
