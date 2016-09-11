import {BaseAction} from './BaseAction';
import {Config} from '../config';
import {Deployment} from '../Deployment';
import {Session} from '../Session';
import {SessionManager, SessionManagerConfig, SessionGroup, SessionsMap} from '../SessionManager';

const _ = require('underscore');

export interface LogsOptions {
  tail?: boolean;
  init?: string;
}

function journalctl(config : Config, tailOptions) {
  return `sudo journalctl -u ${config.app.name}.service --since today ${tailOptions.join(' ')}`;
}

export class LogsAction extends BaseAction {

  protected logConfig : any;

  constructor(config : Config, logConfig = {}) {
    super(config);
    this.logConfig = _.extend({
      "onStdout": (hostPrefix, data) => {
        process.stdout.write(hostPrefix + data.toString());
      },
      "onStderr": (hostPrefix, data) => {
        process.stderr.write(hostPrefix + data.toString());
      }
    }, logConfig);
  }

  public run(deployment : Deployment, sites : Array<string>, options : LogsOptions) : Promise<any> {

    const self = this;
    let tailOptions = [];
    if (options.tail) {
      tailOptions.push('-f');
    }
    const tailOptionArgs = tailOptions.join(' ');

    function tailCommand(config : Config, tailOptions, os : string = 'linux') {
      if (os == 'linux') {
        return 'sudo tail ' + tailOptions.join(' ') + ' /var/log/upstart/' + config.app.name + '.log';
      } else if (os == 'sunos') {
        return 'sudo tail ' + tailOptions.join(' ') +
          ' /var/svc/log/site-' + config.app.name + '\\:default.log';
      } else {
        throw new Error("Unsupported OS.");
      }
    }

    let sitesPromise = Promise.resolve({});
    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        sitesPromise = sitesPromise.then(() => {
            const siteConfig = this.getSiteConfig(site);
            const sessionsMap = this.createSiteSessionsMap(siteConfig);
            let sessionGroupPromises = _.map(sessionsMap, (sessionGroup : SessionGroup, os : string) => {
                const sessionPromises = sessionGroup.sessions.map((session : Session) => {
                    let hostPrefix = `(${site}) [${session._host}] `;
                    let serverConfig = session._serverConfig;
                    let isSystemd = serverConfig.init === "systemd" || siteConfig.init === "systemd" || options.init === "systemd";
                    let command = isSystemd
                        ? journalctl(this.config, tailOptions)
                        : tailCommand(this.config, tailOptions, os)
                        ;
                    return new Promise(resolve => {
                        session.execute(command, {
                          "onStdout": (data) => {
                            this.logConfig.onStdout(hostPrefix, data);
                          },
                          "onStderr": (data) => {
                            this.logConfig.onStderr(hostPrefix, data);
                          }
                        }, () => {
                          resolve();
                        });
                    });
                });
                return Promise.all(sessionPromises);
            });
            return Promise.all(sessionGroupPromises);
        });
    }
    return sitesPromise;
  }
}
