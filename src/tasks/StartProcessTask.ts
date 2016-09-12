import {SCRIPT_DIR, TEMPLATES_DIR} from "./Task";
import {DeployTask} from "./DeployTask";

const fs = require('fs');
const path = require('path');
const util = require('util');

export class StartProcessTask extends DeployTask {

  public describe() : string {
    return 'Invoking deployment process';
  }

  public build(taskList) {
    const appName = this.config.app.name;
    taskList.executeScript(this.describe(), {
      'script': path.resolve(TEMPLATES_DIR, 'deploy.sh'),
      'vars': this.extendArgs({
        'deployCheckWaitTime': this.config.deploy.checkDelay || 10
      })
    });
  }
}
