import {SCRIPT_DIR, TEMPLATES_DIR} from "./Task";
import {SetupTask} from "./SetupTask";
import {Config, AppConfig} from "../config";

const fs = require('fs');
const path = require('path');
const util = require('util');

export class SystemdSetupTask extends SetupTask {

  public describe() : string {
    return 'Configuring systemd: ' + this.getConfigPath();
  }

  protected getConfigPath() : string {
    return `/lib/systemd/system/${this.getAppName()}.service`;
  }

  public build(taskList) {
    taskList.copy(this.describe(), {
      'src': path.resolve(TEMPLATES_DIR, 'meteor/systemd.conf'),
      'dest': this.getConfigPath(),
      'vars': this.extendArgs({}),
    });
  }
}
