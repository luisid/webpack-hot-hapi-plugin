module.exports = webpackHotPlugin;

var helpers = require('./helpers');
var stream = require('stream');
var pathMatch = helpers.pathMatch;

function webpackHotPlugin(compiler, opts) {
  opts = opts || {};
  opts.log = typeof opts.log == 'undefined' ? console.log : opts.log;
  opts.path = opts.path || '/__webpack_hmr';
  opts.heartbeat = opts.heartbeat || 10 * 1000;

  var eventStream = createEventStream(opts.heartbeat);
  compiler.plugin("compile", function () {
    if (opts.log) opts.log("webpack building...");
    eventStream.publish({ action: "building" });
  });
  compiler.plugin("done", function (stats) {
    stats = stats.toJson();
    if (opts.log) {
      opts.log("webpack built " + stats.hash + " in " + stats.time + "ms");
    }
    eventStream.publish({
      action: "built",
      time: stats.time,
      hash: stats.hash,
      warnings: stats.warnings || [],
      errors: stats.errors || [],
      modules: buildModuleMap(stats.modules)
    });
  });
  
  var plugin = function (server, options, next) {
    
    server.route({
			method: 'GET',
			path: opts.path,
			handler: eventStream.handler
    });

    next();
  };
  //plugin.publish = eventStream.publish;

  plugin.attributes = {
    name: 'webpack-hot-hapi-plugin',
    version: '1.0.0'
  }

  return plugin;
}

function createEventStream(heartbeat) {
  var clientId = 0;
  var clients = {};
  function everyClient(fn) {
    Object.keys(clients).forEach(function (id) {
      fn(clients[id]);
    });
  }
  setInterval(function heartbeatTick() {
    everyClient(function (client) {
      client.write("data: \uD83D\uDC93\n\n");
    });
  }, heartbeat).unref();
  return {
    handler: function (request, reply) {
      var channel = new stream.PassThrough

      var id = clientId++;
      clients[id] = channel;
      request.raw.req.on("close", function () {
        delete clients[id];
      });

      channel.write("data: \uD83D\uDC93\n\n");

      var response = reply(channel).hold();
      response.code(200);
      response.type('text/event-stream');
      response.header('Connection', 'keep-alive');
      response.header('Cache-Control', 'no-cache');
      response.send();
    },
    publish: function (payload) {
      everyClient(function (client) {
        client.write("data: " + JSON.stringify(payload) + "\n\n");
      });
    }
  };
}

function buildModuleMap(modules) {
  var map = {};
  modules.forEach(function (module) {
    map[module.id] = module.name;
  });
  return map;
}
