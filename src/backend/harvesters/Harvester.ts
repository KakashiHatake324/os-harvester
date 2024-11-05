import { BrowserWindow, net, session } from "electron";
import { readFileSync } from "fs";
import { SocketServer } from "../server/Websockets";
import { logger } from "../../utils/logger";
export var HarvesterPool: HavesterWindow[] = [];
export let SolvedCaptchas = new Map<string, string>();

// Harvester class
export default class HavesterWindow {
  public Information: HarvesterStruct;
  private harvesterWindow: BrowserWindow;
  private IsIntercepting: boolean;
  private captchaSession: Electron.Session;
  private formatedProxy: IFormattedProxy;

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
        show: false,
        skipTaskbar: true,
        focusable: false,
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
      logger.info(`[${this.Information.Name}] Harvester opened.`);
      this.captchaSession = this.harvesterWindow.webContents.session;
      this.harvesterWindow.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      );
      this.harvesterWindow.webContents.on(
        "login",
        (_e, _details, _authInfo, callback) => {
          callback(
            this.formatedProxy?.auth?.username || "",
            this.formatedProxy?.auth?.password || ""
          );
        }
      );
      await this.reset();
    } else {
      logger.warn(`[${this.Information.Name}] This harvester is already open.`);
    }
  }

  // Use the harvester to solve a captcha
  async solveCapcha(task: HarvesterRequest): Promise<HarvesterResponse> {
    this.Information.InUse = true;
    if (task.proxy && task.proxy !== "") await this.setTempProxy(task.proxy);
    let taskType: string;
    let token: string;
    let captchaHTML: Buffer;
    if (this.IsIntercepting) {
      this.harvesterWindow.webContents.session.protocol.uninterceptProtocol(
        "https"
      );
    }

    this.harvesterWindow.show();

    logger.info(
      `[${task.taskId}] solving captcha on harvester ${this.Information.Name}`
    );

    try {
      if (task.captchaTypes.Checkpoint) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
        taskType = "CHECKPOINT";
      } else if (task.captchaTypes.V2) {
        captchaHTML = this.genV2HTML(task.siteKey, task.taskId);
        taskType = "V2";
      } else if (task.captchaTypes.V2Invisible) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
        taskType = "V2INVISIBLE";
      } else if (task.captchaTypes.V3) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
        taskType = "V3";
      } else if (task.captchaTypes.V3Enterprise) {
        captchaHTML = this.genV2InvisibleHTML(task.siteKey, task.taskId);
        taskType = "V3ENTERPRISE";
      } else {
        return { Success: false, Token: "", Taskid: task.taskId };
      }

      logger.info(`[${task.taskId}] (${taskType}) created the html`);

      this.IsIntercepting =
        this.harvesterWindow.webContents.session.protocol.interceptBufferProtocol(
          "https",
          (request, callback) => {
            if (request.url === task.siteURL) {
              logger.info(
                `[${task.taskId}] (${taskType}) injecting the html ${request.url}`
              );
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

      logger.info(`[${task.taskId}] (${taskType}) setting up the intercept`);

      await this.harvesterWindow
        .loadURL(task.siteURL)
        .catch((e) => {
          logger.error(
            `[${task.taskId}] (${taskType}) error loading the url: ${e}`
          );
          throw e;
        })
        .then(() => {
          logger.info(`[${task.taskId}] (${taskType}) loaded the url`);
        });

      while (this.IsIntercepting) {
        try {
          token = await this.getToken();
        } catch (e) {
          logger.error(
            `[${task.taskId}] (${taskType}) error getting token ${e}`
          );
          throw e;
        }
        if (!(await this.stringEmpty(token))) {
          logger.info(
            `[${task.taskId}] (${taskType}) completed captcha successefully, TOKEN: ${token}`
          );
          this.sendToken(token, task.taskId);
          break;
        }
        await delay(500);
      }
    } catch (e) {
      logger.info(
        `[${task.taskId}] (${taskType}) error solving the captcha ${e}`
      );
      if (!token) {
        SocketServer.sendMessage({
          action: "failed",
          message: "could not solve captcha",
          solved: { Success: false, Token: "", Taskid: task.taskId },
          openHarvesters: [],
        });
      }
    } finally {
      this.Information.InUse = false;
      this.IsIntercepting = false;
      this.harvesterWindow.webContents.session.protocol.uninterceptProtocol(
        "https"
      );
      await this.reset();
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
    this.formatedProxy = formatProxy(newProxy);
    await this.captchaSession
      .setProxy({ proxyRules: this.formatedProxy.url })
      .catch((e) => {
        logger.error("error setting proxy", e);
      })
      .then(() => {
        logger.info("proxy was set");
      });
  }

  genV2HTML(key: string, taskId: string): Buffer {
    return Buffer.from(`
    <!DOCTYPE html>
        <html lang="en">
        <head>
        <title>Recaptcha Harvester</title>
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
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
            <div class="g-recaptcha" data-sitekey="${key}"></div>
            </div>
            <script>
            window.addEventListener('load', function () {
                grecaptcha.execute();
            })
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
            <div class="g-recaptcha" data-sitekey="${key}" data-size="invisible"></div>
            </div>
            <script>
            window.addEventListener('load', function () {
                grecaptcha.execute();
            })
            </script>
          </body>
        </html>
        `);
  }

  private async getToken(): Promise<string> {
    return await this.harvesterWindow.webContents
      .executeJavaScript(`grecaptcha.getResponse()`)
      .catch((r) => {
        logger.error("error getting token", r);
      });
  }

  private sendToken(token: string, taskId: string) {
    SocketServer.sendMessage({
      action: "completed",
      message: "completed a captcha",
      solved: { Success: true, Token: token, Taskid: taskId },
      openHarvesters: [],
    });
  }

  private async stringEmpty(check: any): Promise<boolean> {
    if (check === undefined || check === "" || check === "undefined") {
      return true;
    } else {
      return false;
    }
  }

  async reset() {
    await this.harvesterWindow.loadURL("https://www.google.com");
    this.Information.InUse = false;
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
  try {
    let harvester: HavesterWindow = await locateOpenHarvester();
    logger.info(`Found an open harvester and will use it to solve..`);
    useHarvester(request, harvester);
  } catch (e) {
    console.error(`error selecting and using harvester: ${e}`);
  }
}

// Locate an open harvester, set it in use and return it
export async function locateOpenHarvester(): Promise<HavesterWindow> {
  while (true) {
    for await (const harvester of HarvesterPool) {
      if (!harvester.inUse()) {
        harvester.setUse();
        return harvester;
      }
    }
    await delay(100);
  }
}

// Use the harvester returned by locateOpenHarvester()
export async function useHarvester(
  task: HarvesterRequest,
  harvester: HavesterWindow
) {
  harvester.solveCapcha(task);
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

let currentTasks = 0;

export async function limitedSolveCaptcha(request: HarvesterRequest) {
  if (currentTasks >= HarvesterPool.length) {
    await delay(100); // Short delay before retrying
    return limitedSolveCaptcha(request);
  }
  currentTasks++;
  try {
    await solveCaptcha(request);
  } finally {
    currentTasks--;
  }
}
