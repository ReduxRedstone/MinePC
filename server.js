const express    = require("express");
const app        = express();
const port       = 8080;
const util       = require("util");
const bodyParser = require("body-parser");
const mcproto    = require("minecraft-protocol");
const mctokens   = require("prismarine-tokens");
const formatList = {
  	"black": "§0",
  	"dark_blue": "§1",
  	"dark_green": "§2",
  	"dark_aqua": "§3",
  	"dark_red": "§4",
  	"dark_purple": "§5",
  	"gold": "§6",
  	"gray": "§7",
  	"dark_gray": "§8",
  	"blue": "§9",
  	"green": "§a",
  	"aqua": "§b",
  	"red": "§c",
  	"light_purple": "§d",
  	"yellow": "§e",
  	"white": "§f",
  	"obfuscated": "§k",
  	"bold": "§l",
  	"strikethrough": "§m",
  	"underlined": "§n",
  	"italic": "§o",
  	"reset": "§r"
};
const dictionary = {
  	"chat.stream.emote": "(%s) * %s %s",
  	"chat.stream.text": "(%s) &lt;%s&gt; %s",
  	"chat.type.achievement": "%s has just earned the achievement %s",
  	"chat.type.admin": "[%s: %s]",
  	"chat.type.announcement": "[%s] %s",
  	"chat.type.emote": "* %s %s",
  	"chat.type.text": "&lt;%s&gt; %s"
};

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set("views", __dirname + "/templates");
app.set("view engine", "jade");

app.engine("jade", require("jade").__express);

app.get("/", function(req, res) {
  	res.render("login");
});
app.post("/", function(req, res) {
	var verifiedVersions = ["1.7.10","1.8.8","1.9","1.9.2","1.9.4","1.10","1.10.1","1.10.2"];
	var data = [{
    	email: req.body.email,
    	pass: req.body.pass,
    	server: req.body.server,
    	port: req.body.port,
  	}];
  	if (verifiedVersions.indexOf(req.body.version) >= 0) {
  		data[0].version = req.body.version;
	} else {
		data.version = "1.10.2";
	    console.log("Illegal version found. Defaulting to 1.10.2");
	}
  	res.render("chat", {data: data});
});

var io = require("socket.io").listen(app.listen(port, function () {
  	console.log("Node site running on port "+port);
}));

io.on("connection", function (socket) {
	var socketID = socket.id;
	console.log(socketID);
	io.to(socketID).emit("private message", socketID);

	socket.on("send", function (data) {
	    socket.mcclient.write("chat", {message:data.message, position:0});
	});
	socket.on("disconnect", function() {
      	if (socket.mcclient) {
        	socket.mcclient.end("Socket Closed");
        	delete socket.mcclient;
      	}
    	console.log("Got disconnect!");
  	});
	socket.on("logoutUser", function (data) {
    	socket.disconnect();
  	});
	socket.on("loginUser", function(data) {
		io.to(socketID).emit("message", {message:"§aAttempting to you in....§r §dSocket ID: "+socketID+"§r",clientID:socketID});
	    var mcparams = {
	    	host: data.data.serverIP,
	      	port: data.data.serverPort,
	      	username: data.data.username,
	    };
	    if (data.data.serverVersion) {
	    	mcparams.version = data.data.serverVersion;
	    } else {
	    	console.log("No version posted. Defaulting to 1.10.2.");
	    	mcparams.version = "1.10.2";
	    }

	    if (data.data.password) mcparams.password = data.data.password;

	    mctokens.use(mcparams, function(error, opts) {
	    	if (error) {
	       		io.to(socketID).emit("message", {message:error,clientID:socketID});
	       		socket.disconnect();
	      	}
	      	socket.mcclient = mcproto.createClient(opts);
	      	socket.mcclient.on("success", function(player, status) {
		        console.log("Socket user: "+socketID+" Logged in");
		        io.to(socketID).emit("message", {message:"§aLogged in§r",clientID:socketID});
		    });
		    socket.mcclient.on("login", function(player, status) {
		        console.log("Socket user: "+socketID+" Joined server");
				io.to(socketID).emit("message", {message:"§eJoined server.§r",clientID:socketID});
				io.to(socketID).emit("message", { message: "§9Chatting with the server via website!§r",clientID:socketID});
				socket.mcclient.write("settings", {
				    locale: "en_US",
				    skinParts: 127
				  });
		    });
		    socket.mcclient.on("chat", function(packet) {
        		var j = JSON.parse(packet.message);
        		var chat = parseChat(j, {});
        		io.to(socketID).emit("message", {message:chat+"§r",clientID:socketID});
      		});

      		socket.mcclient.on("kick_disconnect", function(packet) {
        		console.log(packet);
        		console.log("Client left");
        		io.to(socketID).emit("message", {message:"§4Client left§r",clientID:socketID});
        		if (socket.mcclient) {
          			socket.mcclient.end("Socket Closed");
          			delete socket.mcclient;
        		}
        		if (socket) {
          			socket.disconnect();
        		}
      		});
      		socket.mcclient.on("error", function(packet) {
        		console.log("ERROR");
		        io.to(socketID).emit("message", {message:util.inspect(packet),clientID:socketID});
		        if (socket.mcclient) {
		          	socket.mcclient.end("Socket Closed");
		          	delete socket.mcclient;
		        }
		        if (socket) {
		          	socket.disconnect();
		        }
      		});
      		socket.mcclient.on("end", function(packet) {
        		console.log(packet);
				console.log("Client left");
				io.to(socketID).emit("message", {message:"§4Client left§r",clientID:socketID});
		        if (socket.mcclient) {
		          	socket.mcclient.end("Socket Closed");
		          	delete socket.mcclient;
		        }
		        if (socket) {
		          	socket.disconnect();
		        }
      		});
	    });
	    console.log("login user");
	});
});



function parseChat(chatObj, parentState) { // Ripped from a NMP example script and edited to work for this client. Works well, but has some bugs.
  	function getColorize(parentState) {
    	var myColor = "";
    	if("color" in parentState) myColor = formatList[parentState.color];
	    if(parentState.bold) myColor = "§l"+myColor;
	    if(parentState.underlined) myColor = "§m"+myColor;
	    if(parentState.obfuscated) myColor = "§k"+myColor;
	    //if(myColor.length > 0) myColor = myColor.slice(0, -1);
	    return myColor;
  	}

  	if(typeof chatObj === "string") {
    	return getColorize(chatObj);
  	} else {
	    var chat = "";
	    if("color" in chatObj) parentState.color = chatObj["color"];
	    if("bold" in chatObj) parentState.bold = chatObj["bold"];
	    if("italic" in chatObj) parentState.italic = chatObj["italic"];
	    if("underlined" in chatObj) parentState.underlined = chatObj["underlined"];
	    if("strikethrough" in chatObj) parentState.strikethrough = chatObj["strikethrough"];
	    if("obfuscated" in chatObj) parentState.obfuscated = chatObj["obfuscated"];

	    if("text" in chatObj) {
	      	chat += getColorize(parentState)+chatObj.text;
	    } else if("translate" in chatObj && dictionary.hasOwnProperty(chatObj.translate)) {
	      	var args = [dictionary[chatObj.translate]];
	      	chatObj["with"].forEach(function(s) {
	        	args.push(parseChat(s, parentState));
	      	});

	      	chat += util.format.apply(this, args);
	    }
	    if (chatObj.extra) {
	      	chatObj.extra.forEach(function(item) {
	        	chat += parseChat(item, parentState);
	      	});
	    }
	    return chat;
  	}
}