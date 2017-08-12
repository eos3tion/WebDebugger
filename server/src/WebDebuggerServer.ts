/// <reference path="../../common/Define.ts" />

import * as WebSocket from "ws";
import * as repl from "repl";
import * as https from "https";
import * as fs from "fs";


interface ConnectInfo extends ConnectCmdData {
    ip: string;
    port: number;
    useProxy: true;
}
const enum Constant {
    ProjectName = "WDServer",

    /**
     * 调试器监听的端口号
     */
    DebugPort = 1212,

    Key_ConnectInfo = "connectInfo",

    Key_ClientID = "clientId",

    DefaulSSLCrt = "./ssl/test.crt",

    DefaultSSLKey = "./ssl/test.key",

}

const enum ReplCmd {
    /**
     * 显示所有客户端
     */
    ShowClients = "@showAll",

    /**
     * 切换客户端
     */
    SwitchClient = "@switch",
}

const ReplCmds = [ReplCmd.ShowClients, ReplCmd.SwitchClient];

let wss: WebSocket.Server;

let replServer: repl.REPLServer;
/**
 * 当前切换的客户端的标识
 */
let currentID: number;

/**
 * 客户端标识的自增值
 */
let clientIDSeed = 1;

/**
 * 执行指令的自增值
 */
let executeIDSeed = 1;

const enum CallerType {
    /**
     * 由Repl的 eval触发，即：按`回车键`
     */
    OnEnter = 1,
    /**
     * 有Repl的 completer触发，即：按`Tab键`
     */
    OnTab = 2
}

interface ExecuteCmdRPC extends ExecuteCmd {
    /**
     * 指令对应的
     * 客户端id
     * 
     * @type {number}
     * @memberof ExecuteCmdRPC
     */
    clientID: number;

    /**
     * 发送的时间戳
     * 
     * @type {number}
     * @memberof ExecuteCmdRPC
     */
    sendTime: number;

    callerType: number;

    /**
     * 原始的语句
     * 
     * @type {string}
     * @memberof ExecuteCmdRPC
     */
    raw?: string;

    /**
     * 是否添加了window前缀进行执行
     * 
     * @type {boolean}
     * @memberof ExecuteCmdRPC
     */
    addWindow?: boolean;

    callback: { (param1: null, param2: [string[], string]) }
}

/**
 * 发送给客户端执行的指令字典
 */
const cmdDict = new Map<number, ExecuteCmdRPC>();

WebSocket.prototype.toString = function () {
    let info = this[Constant.Key_ConnectInfo] as ConnectInfo;
    return `id:${this[Constant.Key_ClientID]}\t${info ? `info:{ ip:${info.ip}\t referer:${info.referer}` : ""}`;
}


/**
 * 尝试发送指令到客户端
 * 
 * @param {string} expression       要发送给客户端执行的语句
 * @param {CallerType} callerType   触发类型
 * @param {string} [raw]            原始的语句
 */
function sendToClient(expression: string, callerType: CallerType, raw?: string) {
    let client = getWSbyId(currentID);
    if (client) {
        let cmd = {} as ExecuteCmdRPC;
        cmd.type = CmdType.Execute;
        cmd.data = expression;
        cmd.id = executeIDSeed;
        client.send(JSON.stringify(cmd));
        cmd.callerType = callerType;
        cmd.sendTime = Date.now();
        cmd.raw = raw;
        cmdDict.set(executeIDSeed, cmd);
        executeIDSeed++;
        return cmd;
    } else {
        console.log(`id为${currentID}的客户端已经离线，请使用"@ ${ReplCmd.SwitchClient} 客户端id"指令 重新指定客户端`);
    }
}

/**
 * 按`tab键`的执行
 * 
 * @param {string} expression 
 * @returns 
 */
function onTab(expression: string, callback) {
    if (expression.startsWith("@")) {
        const hits = ReplCmds.filter((c) => c.startsWith(expression));
        callback(null, [hits.length ? hits : ReplCmds, expression]);
    } else {
        let subs = expression.split(".");
        let len = subs.length;
        let addWindow = len == 1;
        let execute = addWindow ? "window" : subs.slice(0, len - 1).join(".");
        let cmd = sendToClient(execute, CallerType.OnTab, expression);
        if (cmd) {
            cmd.addWindow = addWindow;
            cmd.callback = callback;
        } else {
            callback(null, [[], expression]);
        }
    }
}

/**
 * 按`回车键`的执行
 * 
 * @param {string} expression 
 */
function onEnter(expression: string) {
    if (expression.endsWith(`\n`)) {
        expression = expression.substring(0, expression.length - 1);
    }
    if (expression.startsWith("@")) {
        let args = expression.split(/\s/);
        switch (args[0]) {
            case ReplCmd.ShowClients:
                let clients = wss.clients;
                clients.forEach(client => console.log(client.toString()))
                break;
            case ReplCmd.SwitchClient:
                let id = +args[1];
                let client = getWSbyId(id);
                if (client) {
                    currentID = id;
                } else {
                    console.log(`id为${id}的客户端已经离线，请使用"@ ${ReplCmd.ShowClients}"指令，查看在线的客户端`);
                }
                break;
        }
    } else if (currentID) {
        sendToClient(expression, CallerType.OnEnter);
    } else {
        console.log(`请使用"@ ${ReplCmd.SwitchClient} 客户端id"指令指定客户端`);
    }
}

function getWSbyId(id) {
    let clients = wss.clients;
    for (let client of clients) {
        if (client[Constant.Key_ClientID] == id) {
            return client;
        }
    }
}

function formatString(val) {
    if (typeof val === "string") {
        return val.replace(/\\r/g, "\r").replace(/\\n/g, "\n");
    }
    return val;
}

function start(port: number = Constant.DebugPort, ssl?: boolean, cer?: string, key?: string) {
    let opt = {} as WebSocket.IServerOptions;
    if (ssl) {
        cer = cer || Constant.DefaulSSLCrt;
        key = key || Constant.DefaultSSLKey;
        if (!fs.existsSync(cer) || !fs.existsSync(key)) {
            console.error(`ssl秘钥路径配置有误`)
            return process.exit(1);
        }
        let server = https.createServer({
            cert: fs.readFileSync(cer),
            key: fs.readFileSync(key)
        });
        opt.server = server;
        server.listen(port);
    } else {
        opt.port = port;
    }
    wss = new WebSocket.Server(opt);
    console.log(`服务器${ssl ? "使用SSL" : ""}开始监听[${port}]端口`)
    replServer = repl.start({
        prompt: `${Constant.ProjectName}>`,
        eval: onEnter,
        completer: onTab,
    });

    wss.on("connection", (client, req) => {
        let headers = req.headers;
        let rawIp = headers["x-forwarded-for"];
        let info = {} as ConnectInfo;
        if (rawIp) {//有此数据一定是由代理服务器代理的结果
            info.ip = rawIp;
            info.useProxy = true;
        } else {//也可能是代理，但是没法拿到数据
            let connection = req.connection;
            info.ip = connection.remoteAddress;
            info.port = connection.remotePort;
        }
        client[Constant.Key_ConnectInfo] = info;
        client[Constant.Key_ClientID] = clientIDSeed;
        if (!currentID) {//第一次连接的客户端作为当前指令对应的客户端
            currentID = clientIDSeed;
        }
        clientIDSeed++;
        client.on("close", (code, message) => {
            //处理发送的指令
            let clientId = client[Constant.Key_ClientID];
            let cmdWillBeRemove = [] as ExecuteCmdRPC[];
            cmdDict.forEach(cmd => {
                if (cmd.clientID == clientId) {
                    cmdWillBeRemove.push(cmd);
                }
            })
            for (let i = 0; i < cmdWillBeRemove.length; i++) {
                let cmd = cmdWillBeRemove[i];
                cmdDict.delete(cmd.id);
                if (cmd.callerType == CallerType.OnTab) {
                    cmd.callback(null, [[], cmd.raw]);
                }
            }
            console.log(`id为${clientId}的客户端断开连接`);
        });
        client.on("message", (data) => {
            if (data) {
                let cmd: Cmd;
                try {
                    cmd = JSON.parse(data);
                } catch (e) {
                    return console.log(`客户端发送结果有误`);
                }
                switch (cmd.type) {
                    case CmdType.Connect:
                        {
                            let data = cmd.data as ConnectCmdData;
                            info.referer = data.referer;
                            info.ua = data.ua;
                            console.log("客户端连接成功：", client.toString());
                        }
                        break;
                    case CmdType.ExecuteResult:
                        {
                            let id = cmd.id;
                            let sendedCmd = cmdDict.get(id);
                            let define = cmd.data as ObjectDefine;
                            if (sendedCmd) {
                                cmdDict.delete(id);
                                //检查执行类型
                                switch (sendedCmd.callerType) {
                                    case CallerType.OnTab:
                                        if (define) {
                                            const { type, data } = define;
                                            if (typeof data == "object") {
                                                let { raw, addWindow } = sendedCmd;
                                                let start = addWindow ? "" : sendedCmd.data + ".";
                                                const keys = data.map(entity => start + entity.key);
                                                const hints = keys.filter(key => key.startsWith(raw));
                                                let result = hints && hints.length ? hints : keys;
                                                return sendedCmd.callback(null, [result, raw]);
                                            }
                                        }
                                        break;
                                }
                            }
                            if (define) {
                                let { type, data } = define;
                                if (typeof data == "object") {
                                    let output = {};
                                    data.forEach(entity => {
                                        if (entity.getter || entity.setter) {
                                            output[entity.key] = {
                                                set: formatString(entity.setter),
                                                get: formatString(entity.getter)
                                            }
                                        } else {
                                            output[entity.key] = entity.value;
                                        }
                                    })
                                    console.log(JSON.stringify(output, null, 2));
                                } else {
                                    console.log(data);
                                }
                            } else {
                                console.log(undefined);
                            }
                        }
                        break;
                    case CmdType.ExecuteError:
                        {
                            let data = cmd.data as ErrorCmdData;
                            let id = cmd.id;
                            let sendedCmd = cmdDict.get(id);
                            let define = cmd.data as ObjectDefine;
                            if (sendedCmd) {
                                cmdDict.delete(id);
                                switch (sendedCmd.callerType) {
                                    case CallerType.OnEnter:
                                        console.log(`error:${data.message}\nstack:\n${data.stack}`);
                                        break;
                                    case CallerType.OnTab:
                                        sendedCmd.callback(null, [[], sendedCmd.raw]);
                                        break;
                                }
                            }

                        }
                        break;
                }
            }
        });
    });
}

let argv = process.argv;
let port = +process.argv[2] || undefined;
let useSSL = !!argv[3];
let cer = argv[4];
let key = argv[5];

start(port, useSSL, cer, key);