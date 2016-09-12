const nodemiral = require('nodemiral');
const fs = require('fs');
const path = require('path');
const util = require('util');
const _ = require('underscore');

import {Config, AppConfig, SiteConfig} from "../config";

const DEPLOY_PREFIX = "/opt";

import {BaseTaskBuilder} from "./BaseTaskBuilder";

import {
  SCRIPT_DIR, TEMPLATES_DIR,
  Task,
  SetupTask,
  AptGetUpdateTask,
  NodeJsSetupTask,
  MeteorEnvSetupTask,
  PhantomJsSetupTask,
  MongoSetupTask,
  StudSetupTask,
  CertbotSetupTask,
  CertbotRenewTask,
  SystemdSetupTask,
  UpstartSetupTask,
  EnvVarsTask,
  BashEnvVarsTask,
  DeployTask,
  StartProcessTask,
  CopyBundleDeployTask,
  RestartTask
} from "../tasks";


function translateBackupMongoConfigVars(config : Config) : any {
  if (config.deploy.backupMongo) {
    let backupConfig : any = {};
    if (typeof config.deploy.backupMongo === "object") {
      backupConfig.host = config.deploy.backupMongo.host || 'localhost';
      backupConfig.port = config.deploy.backupMongo.port || 27017;
      backupConfig.db = config.deploy.backupMongo.db || config.app.name;
    }
    return backupConfig;
  }
  return null;
}
// 'backupMongo': translateBackupMongoConfigVars(this.config),



class SetupTaskListBuilder {

  protected builder;

  constructor(builder) {
    this.builder = builder;
  }

  public definitions(config : Config) {
    const defs =  {
      "updatePackages": new AptGetUpdateTask(config),
      "node": new NodeJsSetupTask(config),
      "phantom": new PhantomJsSetupTask(config),
      "environment": new MeteorEnvSetupTask(config),
      "mongo": new MongoSetupTask(config),
      "upstart": new UpstartSetupTask(config),
      "systemd": new SystemdSetupTask(config),
    }
    const siteConfig = this.builder.getSiteConfig();

    if (siteConfig.ssl) {
      defs["stud"] = new StudSetupTask(config, siteConfig.ssl);

      if (siteConfig.ssl.certbot) {
        const certbotConfig = siteConfig.ssl.certbot;
        if (!certbotConfig.domain) {
          throw new Error("certbot.domain is not defined");
        }
        if (!certbotConfig.email) {
          throw new Error("certbot.email is not defined");
        }
        defs["certbotSetup"] = new CertbotSetupTask(config, certbotConfig.domain, certbotConfig.email);
        defs["certbotRenew"] = new CertbotRenewTask(config, certbotConfig.domain, certbotConfig.email);
      }
    }
    return defs;
  }

  public buildDefaultTasks(config : Config, definitions) {
    const tasks : Array<Task> = [];
    tasks.push(definitions.updatePackages);

    // Installation
    if (config.setup && config.setup.node) {
      tasks.push(definitions.node);
    }

    if (config.setup && config.setup.phantom) {
      tasks.push(definitions.phantom);
    }

    tasks.push(definitions.environment);

    if (config.setup.mongo) {
      tasks.push(definitions.mongo);
    }

    // Global ssl setup (work for all sites)
    if (config.ssl) {
      tasks.push(definitions.stud);
    }
    tasks.push(definitions.upstart);
    tasks.push(definitions.systemd);
    return tasks;
  }

  public build(config : Config, taskNames : Array<string>) : Array<Task> {
    const taskList = nodemiral.taskList('Setup Tasks');
    const taskDefinitions = this.definitions(config);
    if (taskNames) {
      const tasks = _(taskNames).chain().map((taskName) => {
        return taskDefinitions[taskName];
      }).filter(x => x ? true : false).value();
      tasks.forEach((t:Task) => t.build(taskList));
    } else {
      const tasks = this.buildDefaultTasks(config, taskDefinitions);
      tasks.forEach((t:Task) => t.build(taskList));
    }
    return taskList;
  }
}

class DeployTaskListBuilder {

  static build(config : Config, bundlePath : string, env : any) {
    const taskList = nodemiral.taskList("Deploy app '" + config.app.name + "'");
    const tasks : Array<Task> = [];
    tasks.push(new CopyBundleDeployTask(config, bundlePath));
    tasks.push(new BashEnvVarsTask(config, env));
    tasks.push(new EnvVarsTask(config, env));
    tasks.push(new StartProcessTask(config));
    tasks.forEach((t:Task) => {
      t.build(taskList);
    });
    return taskList;
  }
}


export default class LinuxTaskBuilder extends BaseTaskBuilder {

  public getSiteConfig() : SiteConfig {
    return this.sessionGroup._siteConfig; 
  }

  protected taskList(title : string) {
    return nodemiral.taskList(title);
  }

  public setup(config : Config, taskNames : Array<string>) {
    const builder = new SetupTaskListBuilder(this);
    return builder.build(config, taskNames);
  }

  public deploy(config : Config, bundlePath : string, env : any) {
    return DeployTaskListBuilder.build(config, bundlePath, env);
  };

  public reconfig(env, config : Config) {
    const taskList = this.taskList("Updating configurations (linux)");
    taskList.copy('Setting up Environment Variables', {
      src: path.resolve(TEMPLATES_DIR, 'env.sh'),
      dest: DEPLOY_PREFIX + '/' + config.app.name + '/config/env.sh',
      vars: {
        env: env || {},
        appName: config.app.name
      }
    });
    if (this.sessionGroup._siteConfig.init === "systemd") {
      taskList.execute('Restarting app', {
        command: `sudo systemctl restart ${config.app.name}.service`
      });
    } else {
      taskList.execute('Restarting app', {
        command: '(sudo stop ' + config.app.name + ' || :) && (sudo start ' + config.app.name + ')'
      });
    }
    return taskList;
  }

  public restart(config : Config) {

    const tasks : Array<Task> = [];
    tasks.push(new RestartTask(config));

    const taskList = this.taskList("Restarting Application (linux)");
    tasks.forEach((t : Task) => {
      t.build(taskList);
    });
    return taskList;
  }

  public stop(config : Config) {
    let taskList = this.taskList("Stopping Application (linux)");
    if (this.sessionGroup._siteConfig.init === "systemd") {
      taskList.execute('Stopping app', {
        command: `sudo systemctl stop ${config.app.name}.service`
      });
    } else {
      taskList.execute('Stopping app', { command: `(sudo stop ${config.app.name})` });
    }
    return taskList;
  }

  public start(config : Config) {
    let taskList = this.taskList("Starting Application (linux)");
    if (this.sessionGroup._siteConfig.init === "systemd") {
      taskList.execute('Stopping app', {
        command: 'sudo systemctl start ${config.app.name}.service'
      });
    } else {
      taskList.execute('Starting app', { command: `(sudo start ${config.app.name})` });
    }
    return taskList;
  }
}
