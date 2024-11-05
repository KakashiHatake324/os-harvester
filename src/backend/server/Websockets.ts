import express from "express";
import http from "http";
import WebSocket from "ws";
import { AddressInfo } from "net";
import HavesterWindow, {
  HarvesterPool,
  HarvesterRequest,
  HarvesterResponse,
  limitedSolveCaptcha,
  solveCaptcha,
} from "../harvesters/Harvester";
import { logger } from "../../utils/logger";
export var SocketServer: WebsocketServer;

export default class WebsocketServer {
  public app = express();
  public wss: WebSocket.Server;
  public socket: WebSocket | null = null;

  constructor(port: number) {
    // initialize a simple http server
    const server = http.createServer(this.app);

    // initialize the WebSocket server instance
    this.wss = new WebSocket.Server({ server });

    server.listen(port, () => {
      logger.info(
        `Server started on port ${(server.address() as AddressInfo).port} :)`
      );
    });
  }

  startServer() {
    this.wss.on("connection", (socket) => {
      this.socket = socket;

      logger.info(`connection established`);
      const data: ReturnMessages = {
        action: "Welcome",
        message: "Welcome",
        solved: undefined,
        openHarvesters: HarvesterPool,
      };

      socket.send(JSON.stringify(data));

      socket.on("message", (message) => {
        const data: SocketMessages = JSON.parse(message.toString());
        logger.info(`${data.solve.taskId}:${data.action}`);

        switch (data.action) {
          case "solve":
            limitedSolveCaptcha(data.solve);
            break;
          default:
            break;
        }
      });
    });
  }

  sendMessage(data: ReturnMessages) {
    this.socket.send(JSON.stringify(data));
  }
}

export interface SocketMessages {
  action: string;
  solve: HarvesterRequest;
}

export interface ReturnMessages {
  action: string;
  message: string;
  solved: HarvesterResponse;
  openHarvesters: HavesterWindow[];
}

export async function startNewServer(port: number) {
    SocketServer = new WebsocketServer(port);
}
