var serverHostNmae = null;
var server = null;
if(window.location.protocol === 'http:')
	server = "http://" + serverHostNmae + ":8088/janus";
else
	server = "https://" + serverHostNmae + ":8089/janus";


var janus = null;
var streaming = null;
var opaqueId = "streamingtest-"+Janus.randomString(12);
var spinner = null;
var selectedStream = null;

function JanusStreamingInit() {
    Janus.init({debug: "all", callback: function() {
        if(!Janus.isWebrtcSupported()) {
            bootbox.alert("No WebRTC support... ");
            return;
        }
        janus = new Janus(
            {
                server: server,
                success: function(){
                    attach();
                },
                error: function(error) {
                    Janus.error(error);
                    bootbox.alert(error, function() {
                        window.location.reload();
                    });
                },
                destroyed: function() {
                    window.location.reload();
                }
            }
        );

    }});
}

function attach() {
    janus.attach(
        {
            plugin: "janus.plugin.streaming",
            opaqueId: opaqueId,
            success: function(pluginHandle) {
                streaming = pluginHandle;
                Janus.log("Plugin attached! (" + streaming.getPlugin() + ", id=" + streaming.getId() + ")");
                updateStreamsList();
            },
            error: function(error) {
                Janus.error("  -- Error attaching plugin... ", error);
                bootbox.alert("Error attaching plugin... " + error);
            },
            iceState: function(state) {
                Janus.log("ICE state changed to " + state);
            },
            webrtcState: function(on) {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onmessage: function(msg, jsep) {
                Janus.debug(" ::: Got a message :::", msg);
                onMsg(msg, jsep);
            },
            onremotestream: function(stream){
                Janus.log(" ::: Got a remote stream :::", stream);
                onRemoteStream(stream);
            }, 
            ondataopen: function(data) {
                Janus.log("The DataChannel is available!");
                $('#waitingvideo').remove();
                $('#stream').append(
                    '<input class="form-control" type="text" id="datarecv" disabled></input>'
                );
                if(spinner)
                    spinner.stop();
                spinner = null;
            },
            ondata: function(data) {
                Janus.debug("We got data from the DataChannel!", data);
                $('#datarecv').val(data);
            },  
            oncleanup: function() {
                Janus.log(" ::: Got a cleanup notification :::");
                $('#waitingvideo').remove();
                $('#remotevideo').remove();
                $('#datarecv').remove();
                $('.no-video-container').remove();
            }         
        }
    );
}

function onMsg(msg, jsep) {
    var result = msg["result"];
    if(result) {
        if(result["status"]) {
            var status = result["status"];
            if(status === 'starting')
                Janus.log("Starting, please wait...");
            else if(status === 'started')
                Janus.log("Started");
            else if(status === 'stopped')
                stopStream();
        }
    }else if(msg["error"]) {
        bootbox.alert(msg["error"]);
        stopStream();
        return;
    }
    if(jsep) {
        Janus.debug("Handling SDP as well...", jsep);
        var stereo = (jsep.sdp.indexOf("stereo=1") !== -1);
        // Offer from the plugin, let's answer
        streaming.createAnswer(
            {
                jsep: jsep,
                // We want recvonly audio/video and, if negotiated, datachannels
                media: { audioSend: false, videoSend: false, data: true },
                customizeSdp: function(jsep) {
                    if(stereo && jsep.sdp.indexOf("stereo=1") == -1) {
                        // Make sure that our offer contains stereo too
                        jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1");
                    }
                },
                success: function(jsep) {
                    Janus.log("Got SDP!", jsep);
                    var body = { request: "start" };
                    streaming.send({ message: body, jsep: jsep });
                },
                error: function(error) {
                    Janus.error("WebRTC error:", error);
                    bootbox.alert("WebRTC error... " + error.message);
                }
            });
    }
}

function onRemoteStream(stream) {
    if($('#remotevideo').length === 0) {
        Janus.log(" ::: remotevideo == 0 :::");
        addButtons = true;
        $('#stream').append('<video class="rounded centered hide" id="remotevideo" width="50%" height="50%" playsinline controls autoplay/>');
        $('#remotevideo').get(0).volume = 0.5;
        // Show the stream and hide the spinner when we get a playing event
        $("#remotevideo").bind("playing", function () {
            Janus.log(" ::: playing stream :::");
            $('#waitingvideo').remove();
            if(this.videoWidth)
                $('#remotevideo').removeClass('hide').show();
            if(spinner)
                spinner.stop();
            spinner = null;
            var videoTracks = stream.getVideoTracks();
            if(!videoTracks || videoTracks.length === 0)
                return;
        });
    }
    Janus.attachMediaStream($('#remotevideo').get(0), stream);
    Janus.log("stream =========== "+ stream)
    // $("#remotevideo").get(0).pause();
    // $("#remotevideo").get(0).play();
    // $("#remotevideo").get(0).volume = 1;
    var videoTracks = stream.getVideoTracks();
    if(!videoTracks || videoTracks.length === 0) {
        // No remote video
        $('#remotevideo').hide();
        if($('#stream .no-video-container').length === 0) {
            $('#stream').append(
                '<div class="no-video-container">' +
                    '<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
                    '<span class="no-video-text">No remote video available</span>' +
                '</div>');
        }
    } else {
        $('#stream .no-video-container').remove();
        $('#remotevideo').removeClass('hide').show();
    }
}

function updateStreamsList() {
	var body = { request: "list" };
	Janus.debug("Sending message:", body);
	streaming.send({ message: body, success: function(result) {
		if(!result) {
			bootbox.alert("Got no response to our query for available streams");
			return;
		}
		if(result["list"]) {
			var list = result["list"];
			Janus.log("Got a list of available streams");
			if(list && Array.isArray(list)) {
				list.sort(function(a, b) {
					if(!a || a.id < (b ? b.id : 0))
						return -1;
					if(!b || b.id < (a ? a.id : 0))
						return 1;
					return 0;
				});
			}
            Janus.debug(list);
            var theFirstStream = list[0];
            selectedStream = theFirstStream["id"];
            startStream()
		}
	}});
}

function startStream() {
	Janus.log("Selected video id #" + selectedStream);
	if(!selectedStream) {
		bootbox.alert("Select a stream from the list");
		return;
	}
	var body = { request: "watch", id: parseInt(selectedStream) || selectedStream};
	streaming.send({ message: body });
	// No remote video yet
	// $('#stream').append('<video class="rounded centered" id="waitingvideo" width="100%" height="100%" />');
	if(spinner == null) {
		var target = document.getElementById('stream');
		spinner = new Spinner({top:100}).spin(target);
	} else {
		spinner.spin();
	}
}

function stopStream() {
	var body = { request: "stop" };
	streaming.send({ message: body });
	streaming.hangup();
}
