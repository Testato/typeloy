

import {Config, AppConfig} from "../config";

var path = require('path');
var _ = require('underscore');

export abstract class Task {

  protected config : Config;

  protected appRoot : string;

  protected deployPrefix : string;

  constructor(config : Config) {
    this.config = config;
    this.deployPrefix = '/opt';
    this.appRoot = this.deployPrefix + '/' + this.config.app.name;
  }

  protected getAppRoot() : string {
    return path.join(this.deployPrefix, this.config.app.name);
  }

  protected getAppName() : string {
    return this.config.app.name;
  }

  protected extendArgs(args) {
    return _.extend({
        'deployPrefix': this.deployPrefix,
        'appRoot': this.appRoot,
        'appName': this.config.app.name
    }, args);
  }

  public abstract describe();

  public abstract build(taskList);
}
