const request = require('request');
const spawn = require('child_process');
var gui = require('nw.gui');
var win = gui.Window.get();

var reserves, recorded, channels, timer, default_timer, epgstation_url;
var flag = false;
var int_res, int_timer;
const notice = new Object;

$(document).ready(function(){
    $('.modal').modal();
});

var tray;
win.on('minimize', function() {
    this.hide();
    traymenu = new nw.Menu();
    traymenu.append(new nw.MenuItem({
        label: "Exit",
        click: function() {
          gui.App.quit();
        }
    }));
    tray = new nw.Tray({ 
        title: 'EPGStation Notifier',
        tooltip: 'EPGStation Notifier',
        icon: './img/icon.png',
        menu: traymenu 
    });
    tray.on('click', function() {
      win.show();
      this.remove();
      tray = null;
    });
});

var getChannels = () =>{
    request.get(`${epgstation_url}api/channels`, (e, r, b) => {
        channels = JSON.parse(b);
    })
}

var getServiceId = (channel) =>{
    for(ch of channels) {
        if(ch.id == channel) {
            return ch.serviceId;
        }
    }
}

var getChannelName = (channel) =>{
    for (ch of channels) {
        if(ch.id == channel) {
            return ch.name;
        }
    }
}

var getReserves = () =>{
    request.get(`${epgstation_url}api/reserves`, (e, r, b) => {
        reserves = JSON.parse(b);
        date = new Date();
        let tvtest_link = localStorage.tvtest_path == undefined || JSON.parse(localStorage.tvtest_path) == "" ? "none" : "";
        for(reserve of reserves.reserves){
            if(reserve.program.startAt - date.getTime() < 86400000){
                $('#status').append(
                    $("<div></div>", {
                        "class": "card"
                    }).append(
                        $("<div></div>", {
                            "class": "card-content",
                            style: "padding: 1rem;margin: 0; min-height: 60px;",
                            id: reserve.program.id
                        }).append(
                            $("<h6></h6>", {
                                "class": "truncate",
                                title: reserve.program.name,
                                text: reserve.program.name
                            })
                        ).append(
                            $("<span></span>", {
                                "class": "truncate",
                                "text": getChannelName(reserve.program.channelId)
                            })
                        ).append(
                            $("<span></span>", {
                                text: new Date(reserve.program.startAt).toLocaleDateString("japanese", {
                                        weekday: 'short', 
                                        year: 'numeric', 
                                        month: 'numeric', 
                                        day: 'numeric', 
                                        hour: 'numeric', 
                                        minute: 'numeric'})
                                    +"～"+
                                    new Date(reserve.program.endAt).toLocaleTimeString("japanese", {
                                        hour: 'numeric',
                                        minute: 'numeric'
                                    })
                            })
                                
                        )
                    ).append(
                        $("<div></div>", {
                            "class": "card-action"
                        }).append(
                            $("<a></a>", {
                                href: "#",
                                onclick: "openEPGStation('/stream/program')",
                                text: "EPGStationで視聴"
                            })
                        ).append(
                            $("<a></a>", {
                                href: "#",
                                onclick: "launchTvtest("+reserve.program.channelId+")",
                                text: "TVTestで視聴",
                                style: "display: "+tvtest_link
                            })
                        )
                    )
                )
                setNotification(reserve.program.name, reserve.program.id, reserve.program.channelId, reserve.program.startAt)
            }
        }
        getRecord();
    })
}

var getRecord = function() {
    request.get(`${epgstation_url}api/recorded`, (e, r ,b) => {
        recorded = JSON.parse(b);
        for(record of recorded.recorded){
            if(record.recording){
                $("#recording").remove()
                $(`#${record.programId}`).prepend(
                    $("<span></span>", {
                        "class": "red-text valign-wrapper",
                        id: "recording",
                        text: "Recording"
                    }).prepend(
                        $("<i></i>", {
                            "class": "material-icons",
                            text: "fiber_smart_record"
                        })
                    )
                )
                clearTimeout(notice[record.programId]);
            }
        }
    })
}

var active = function () {
    $('#status').empty();
    getChannels();
    getReserves();
    int_res = setInterval(()=>{
        $('#status').empty();
        getReserves();
        timer = default_timer;
    }, default_timer*1000)

    int_timer = setInterval(()=>{
        timer -= 1;
        $('#timer_bar').css('width', `${(timer / default_timer)*100}%`);
    },1000)
}

var launchTvtest = function(channel) {
    spawn.execFile(JSON.parse(localStorage.tvtest_path), ['/sid', getServiceId(channel)], (err, stdout, stderr)=>{
        if (error) {
            throw error;
        }
    });
}

var openEPGStation = function(page) {
    nw.Shell.openExternal(epgstation_url+'#!'+page);
}

var setNotification = function(title, programId, channel, startTime) {
    date = new Date(); 
    if(startTime - date.getTime() > 0) {
        if(notice[programId] != null) clearTimeout(notice[programId])
        notice[programId] = setTimeout(()=>{
            if("Notification" in window){
                let n = new Notification("EPGStation Notifier", {
                    body: `${title}\nまもなく${getChannelName(channel)}にて放送。`,
                    icon: './img/icon.png',
                    silent: false
                });
                setTimeout(n.close.bind(n), 5000); 
                n.onclick = ()=>{
                    launchTvtest(channel);
                    n.close()
                }
            }
        }, startTime - date.getTime() - 300000)
    }
}

var initSettings = function() {
    if(localStorage.epgstation_url == undefined || JSON.parse(localStorage.epgstation_url) == "") {
        localStorage.reload_interval = 60;
        localStorage.notification = true;
        localStorage.epgstation_url = JSON.stringify("http://192.168.1.1:8888/");
        localStorage.tvtest_path = JSON.stringify(null);
        console.log(1)
        $("#status").append(
            $("div", {
                "class": "card"
            }).append(
                $("div", {
                    "class": "card-content",
                    css: {
                        "padding": "1rem",
                        "margin": "0",
                        "min-height": "60px",
                    },
                    id: "initial"
                }).append(
                    $("h6", {
                        text: "How to Use?"
                    })
                ).append(
                    $("ol").append(
                        $("li", {text: "EPGStationのアドレスを入力。"})
                    ).append(
                        $("li", {text: "TVTest.exeを選択する。(オプション)"})
                    ).append(
                        $("li", {text: "Notificationオンで番組開始5分前から通知。"})
                    ).append(
                        $("li", {text: "Reload Intervalで情報取得頻度を変更。(Default:60秒)"})
                    )
                )
            ).append(
                $("div", {
                    "class": "card-action"
                }).append(
                    $("a", {
                        href: "#settings",
                        "class": "modal-trigger",
                        text: "初期設定を行う"
                    })
                )
            )
        )
        flag = true;
    } else {
        default_timer = JSON.parse(localStorage.reload_interval);
        epgstation_url = JSON.parse(localStorage.epgstation_url);
        if(epgstation_url.slice(-1) != "/") epgstation_url += "/";
        timer = default_timer;
        int_res = int_timer = null;
        flag = true;
    }
}

var saveSettings = function() {
    if($('#epgs_url').val() != "")localStorage.epgstation_url = JSON.stringify($('#epgs_url').val());
    if($('#tvtest_path').val() != "") localStorage.tvtest_path = JSON.stringify($('#tvtest_path').val());
    else localStorage.tvtest_path = JSON.stringify($('#tvtest_filepath').val()) || null;
    localStorage.notification = $('#notify_check').prop('checked');
    localStorage.reload_interval = $('#reload_int').val() || 60;
    $("#initial").parent().fadeOut(300);
    clearInterval(int_res);
    clearInterval(int_timer);
    initSettings();
    active();
}

var loadSettings = function() {
    $('#reload_int').val(JSON.parse(localStorage.reload_interval));
    $('#notify_check').prop('checked', JSON.parse(localStorage.notification));
    if(localStorage.epgstation_url != undefined) {
        if(JSON.parse(localStorage.epgstation_url) != "") $('#epgs_url').val(JSON.parse(localStorage.epgstation_url));
    }
    if(JSON.parse(localStorage.tvtest_path) != "")$('#tvtest_filepath').val(JSON.parse(localStorage.tvtest_path));
}

initSettings();
if(flag) {
    initSettings();
    active();
}
