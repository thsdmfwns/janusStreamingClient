var server = null;
if (window.location.protocol === 'http:') {
    server = "http://" + window.location.hostname + ":8088/janus";
} else {
    server = "https://" + window.location.hostname + ":8089/janus";
}

var janus = null;
var streaming = null;
var started = false;
var spinner = null;
var selectedStream = null;


$(document).ready(function () {
    // Initialize the library (console debug enabled)
    Janus.init({
        debug: true, callback: function () {
            startJanus();
        }
    });
});



function startJanus() {
    console.log("starting Janus");
    $('#start').click(function () {
        if (started) {
            return;
        }
        started = true;
        // Make sure the browser supports WebRTC
        if (!Janus.isWebrtcSupported()) {
            console.error("No webrtc support");
            return;
        };
        // Create session
        janus = new Janus({
            server: server,
            success: function () {
                console.log("Success");
                attachToStreamingPlugin(janus);
            },
            error: function (error) {
                console.log(error);
                console.log("janus error");
            },
            destroyed: function () {
                console.log("destroyed");
            }
        });
    });
}


function attachToStreamingPlugin(janus) {
    // Attach to streaming plugin
    console.log("Attach to streaming plugin");
    janus.attach({
        plugin: "janus.plugin.streaming",
        success: function (pluginHandle) {
            streaming = pluginHandle;
            console.log("Plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")");
            // Setup streaming session
            updateStreamsList();
        },
        error: function (error) {
            console.log("  -- Error attaching plugin... " + error);
            console.error("Error attaching plugin... " + error);
        },
        onmessage: function (msg, jsep) {
            console.log(" ::: Got a message :::");
            console.log(JSON.stringify(msg));
            processMessage(msg);
            handleSDP(jsep);
        },
        onremotestream: function (stream) {
            console.log(" ::: Got a remote stream :::");
            console.log(JSON.stringify(stream));
            handleStream(stream);
        },
        oncleanup: function () {
            console.log(" ::: Got a cleanup notification :::");
        }
    });//end of janus.attach
}

function processMessage(msg) {
    var result = msg["result"];
    if (result && result["status"]) {
        var status = result["status"];
        switch (status) {
            case 'starting':
                console.log("starting - please wait...");
                break;
            case 'preparing':
                console.log("preparing");
                break;
            case 'started':
                console.log("started");
                break;
            case 'stopped':
                console.log("stopped");
                stopStream();
                break;
        }
    } else {
        console.log("no status available");
    }
}


// we never appear to get this jsep thing
function handleSDP(jsep) {
    console.log(" :: jsep :: ");
    console.log(jsep);
    if (jsep !== undefined && jsep !== null) {
        console.log("Handling SDP as well...");
        console.log(jsep);
        // Answer
        streaming.createAnswer({
            jsep: jsep,
            media: { audioSend: false, videoSend: false },      // We want recvonly audio/video
            success: function (jsep) {
                console.log("Got SDP!");
                console.log(jsep);
                var body = { "request": "start" };
                streaming.send({ "message": body, "jsep": jsep });
            },
            error: function (error) {
                console.log("WebRTC error:");
                console.log(error);
                console.error("WebRTC error... " + JSON.stringify(error));
            }
        });
    } else {
        console.log("no sdp");
    }
}


function handleStream(stream) {
    console.log(" ::: Got a remote stream :::");
    console.log(JSON.stringify(stream));
    // Show the stream and hide the spinner when we get a playing event
    console.log("attaching remote media stream");
    Janus.attachMediaStream($('#remotevideo').get(0), stream);
    $("#remotevideo").bind("playing", function () {
        console.log("got playing event");
    });
}


function updateStreamsList() {
    var body = { "request": "list" };
    console.log("Sending message (" + JSON.stringify(body) + ")");
    streaming.send({
        "message": body, success: function (result) {

            if (result === null || result === undefined) {
                console.error("no streams available");
                return;
            }
            if (result["list"] !== undefined && result["list"] !== null) {
                var list = result["list"];
                console.log("Got a list of available streams:");
                console.log(list);
                console.log("taking the first available stream");
                var theFirstStream = list[0];
                startStream(theFirstStream);
            } else {
                console.error("no streams available - list is null");
                return;
            }

        }
    });
}

function startStream(selectedStream) {
    var selectedStreamId = selectedStream["id"];
    console.log("Selected video id #" + selectedStreamId);
    if (selectedStreamId === undefined || selectedStreamId === null) {
        console.log("No selected stream");
        return;
    }
    var body = { "request": "watch", id: parseInt(selectedStreamId) };
    streaming.send({ "message": body });

}

function stopStream() {
    console.log("stopping stream");
    var body = { "request": "stop" };
    streaming.send({ "message": body });
    streaming.hangup();
}