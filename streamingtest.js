var server = null;
if(window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":8088/janus";
else
	server = "https://" + window.location.hostname + ":8089/janus";

var janus = null;
var streaming = null;
var opaqueId = "streamingtest-"+Janus.randomString(12);

var bitrateTimer = null;
var spinner = null;

var simulcastStarted = false, svcStarted = false;

var selectedStream = null;

$(document).ready(function() {
    Janus.init({debug:"all", callback:function() {
        	if(!Janus.isWebrtcSupported()) {
			    bootbox.alert("No WebRTC support... ");
				return;
            }
            janus =new Janus(
                {
                    server:server,
                    success: function(){
                        janusattached();
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
        }
    });
    
});

function janusattached() {
    janus.attach(
        {
            plugin:"janus.plugin.streaming",
            opaqueId:opaqueId,
            success:function(pluginHandle){
                streaming = pluginHandle;
                Janus.log("플러그인 attached! ("+ streaming.getPlugin() + ", id=" + streaming.getId() + ")");
                updateStreamsList()
            },
            error : function(error) {
                Janus.error("  -- Error attaching plugin... ", error);
                bootbox.alert("Error attaching plugin... " + error);
            },
            iceState: function(state) {
                Janus.log("ICE state changed to " + state);
            },
            webrtcState: function(on) {
                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
            },
            onmessage: function(msg, jsep){
                Janus.debug(" ::: Got a message :::", msg);
                var result = msg["result"];
                if (result) {
                    if (result["status"]) {
                        var status = result["status"];
                        if(status === 'starting')
                            Janus.log("Starting, please wait...");
                        else if(status === 'started')
                            Janus.log("Started");
                        else if(status === 'stopped')
                            stopStream();
                    }else if(msg["streaming"] === "event"){
                        //simulcast 발동시
                        var substream = result["substream"];
                        var temporal = result["temporal"];
                        if((substream !== null && substream !== undefined) || (temporal !== null && temporal !== undefined)) {
                            if(!simulcastStarted){
                                simulcastStarted = true;
                                Janus.log("addSimulcastButtons(temporal !== null && temporal !== undefined);");
                            }
                            Janus.log("updateSimulcastButtons(substream, temporal)");
                        }
                        // SVC 발동시
                        var spatial = result["spatial_layer"];
                        temporal = result["temporal_layer"];
                        if ((spatial !== null && spatial !== undefined) || (temporal !== null && temporal !== undefined)) {
                            if (!svcStarted) {
                                svcStarted = true;
                                Janus.log("addSvcButtons();");
                            }
                            Janus.log("updateSvcButtons(spatial, temporal);");
                        }
                    }
                }else if(msg["error"]){
                    bootbox.alert(msg["error"]);
                    stopStream();
                    return;
                }
                if(jsep){
                    Janus.debug("Handling SDP as well...", jsep);
                    var stereo = (jsep.sdp.indexOf("stereo=1") !== -1);
                    //플러그인에서 오퍼가 들어옴
                    //answer 생성
                    streaming.createAnswer(
                        {
                            jsep:jsep,
                            media: { audioSend: false, videoSend: false, data: true },
                            customizeSdp: function(jsep) {
                                if(stereo && jsep.sdp.indexOf("stereo=1") == -1){
                                    //스테리오도 넣어두기
                                    jsep.sdp = jsep.sdp.replace("useinbandfec=1", "useinbandfec=1;stereo=1")
                                }
                            },
                            success: function(jsep){
                                Janus.log("SDP 포착!", jsep);
                                var body = {request : "start"};
                                streaming.send({message: body, jsep:jsep});
                                //stopStream()
                            },
                            error: function(error) {
                                Janus.error("WebRTC error:", error);
                                bootbox.alert("WebRTC error... " + error.message);
                            }
                        }
                    );
                }
            },
            onremotestream: function (stream) {
                onremote(stream);
            },
            ondataopen: function(data) {
                Janus.log("데이터 채널이 열렸습니다!");
                $('#waitingvideo').remove();
                $('#stream').append(
                    '<input class="form-control" type="text" id="datarecv" disabled></input>'
                );
                if(spinner)
                    spinner.stop();
                spinner = null;
            },
            ondata: function(data) {
                Janus.debug("데이터 채널에서 데이터가옴");
            },
            oncleanup: function() {
                Janus.log(" ::: Got a cleanup notification :::");
				$('#waitingvideo').remove();
                $('#remotevideo').remove();
                $('.no-video-container').remove();
            }
        }
    );
}


function stopStream() {
	var body = { request: "stop" };
	streaming.send({ message: body });
	streaming.hangup();
	bitrateTimer = null;
	simulcastStarted = false;
}

function startStream() {
    Janus.log("Selected video id #" + selectedStream);
    if(!selectedStream) {
		bootbox.alert("Select a stream from the list");
		return;
	}
    var body = { request: "watch", id: parseInt(selectedStream) || selectedStream};
    streaming.send({ message: body });
    $('#stream').append('<video class="rounded centered" id="waitingvideo" width="100%" height="100%" />');
    if(spinner == null) {
		var target = document.getElementById('stream');
		spinner = new Spinner({top:100}).spin(target);
	} else {
		spinner.spin();
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
            Janus.log(list);
            var theFirstStream = list[0];
            selectedStream = theFirstStream["id"];
            startStream()
		}
	}});
}

function onremote(stream) {
    Janus.log(" ::: Got a remote stream :::", stream);
    var addButtons = false;
    if($('#remotevideo').length === 0) {
        Janus.log(" ::: remotevideo == 0 :::");
        addButtons = true;
        $('#stream').append('<video class="rounded centered hide" id="remotevideo" width="100%" height="100%" playsinline autoplay=""/>');
        $('#remotevideo').get(0).volume = 0;
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
    $("#remotevideo").get(0).play();
    $("#remotevideo").get(0).volume = 1;
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
    if(!addButtons)
        return;
}

function onremote2(stream){
    Janus.log(" ::: Got a remote stream :::", stream);
    if ($('#remotevideo').length === 0) {
        Janus.log(" ::: remotevideo == 0 :::");
        $('#stream').append('<video class="rounded centered hide" id="remotevideo" width="100%" height="100%" playsinline/>');
        $('#remotevideo').get(0).volume = 0;
        $("#remotevideo").bind("playing", function () {
            Janus.log(" ::: playing stream :::");
            $('#waitingvideo').remove();
            if (this.videoWidth) {
                $('#remotevideo').removeClass('hide').show();
            }
            if (spinner) {
                spinner.stop();
            }
            spinner = null;
            var videoTracks = stream.getVideoTracks();
            if(!videoTracks || videoTracks.length === 0){
                return;
            }
        });
    }
    Janus.attachMediaStream($('#remotevideo').get(0), stream);
    Janus.log("stream =========== "+ stream)
    $("#remotevideo").get(0).play();
    $("#remotevideo").get(0).volume = 1;
    var videoTracks = stream.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) {
        //비디오가 없을때
        if($('#stream .no-video-container').length === 0) {
            $('#stream').append(
                '<div class="no-video-container">' +
                    '<span class="no-video-text">비디오가 없습니다!!!!!!!!!!</span>' +
                '</div>');
        }
    }else {
        $('#stream .no-video-container').remove();
        $('#remotevideo').removeClass('hide').show();
    }
}