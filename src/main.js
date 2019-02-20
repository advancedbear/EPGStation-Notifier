const request = require('request');
const spawn = require('child_process');
var gui = require('nw.gui');
var win = gui.Window.get();

var reserves, recorded, channels, timer, default_timer, epgstation_url;
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
        console.log(channels);
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
        for(reserve of reserves.reserves){
            if(reserve.program.startAt - date.getTime() < 86400000){
                $('#status').append(`<div class="card">
                <div class="card-content" style="padding: 1rem;margin: 0; min-height: 60px;" id="${reserve.program.id}">
                <h6 class="truncate" title="${reserve.program.name}">${reserve.program.name}</h6>
                <span class="truncate">${getChannelName(reserve.program.channelId)}</span>
                <span>${new Date(reserve.program.startAt).toLocaleDateString("japanese", {weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'})}～${new Date(reserve.program.endAt).toLocaleTimeString("japanese", {hour: 'numeric', minute: 'numeric'})}</span>
                </div>
                <div class="card-action">
                <a href="#" onclick="nw.Shell.openExternal('${epgstation_url}#!/stream/program');return false">EPGStationで視聴</a>
                <a href="#" onclick="launchTvtest(${reserve.program.channelId});return false">TVTestで視聴</a>
                </div>
                </div>`)
                setNotification(reserve.program.name, reserve.program.id, reserve.program.channelId, reserve.program.startAt)
            }
        }
        getRecord();
        console.log(`Reserve list: ${reserves.reserves.length}`)
    })
}

var getRecord = function() {
    request.get(`${epgstation_url}api/recorded`, (e, r ,b) => {
        recorded = JSON.parse(b);
        for(record of recorded.recorded){
            if(record.recording){
                $("#recording").remove()
                $(`#${record.programId}`).prepend('<span class="red-text valign-wrapper" id="recording"><i class="material-icons">fiber_smart_record</i>Recording</span>')
                clearTimeout(notice[record.programId]);
            }
        }
        console.log(`Recorded list: ${recorded.recorded.length}`)
    })
}

var active = function () {
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

var setNotification = function(title, programId, channel, startTime) {
    date = new Date(); 
    if(startTime - date.getTime() > 0) {
        console.log(title, programId, channel, startTime)
        if(notice[programId] != null) clearTimeout(notice[programId])
        notice[programId] = setTimeout(()=>{
            if("Notification" in window){
                let n = new Notification("EPGStation Notifier", {
                    body: `${title}\nまもなく${getChannelName(channel)}にて放送。`,
                    icon: './img/icon.png',
                    silent: false
                });
                console.log(n)
                setTimeout(n.close.bind(n), 5000); 
                n.onclick = ()=>{
                    launchTvtest(channel);
                    n.close()
                }
            }
        }, startTime - date.getTime() - 180000)
    }
}

var initSettings = function() {
    if(localStorage.epgstation_url == undefined || JSON.parse(localStorage.epgstation_url) == "") {
        localStorage.reload_interval = 60;
        localStorage.notification = true;
        localStorage.epgstation_url = JSON.stringify("http://192.168.1.1:8888/");
        localStorage.tvtest_path = JSON.stringify(null);
        $("#status").append(`<div class="card">
            <div class="card-content" style="padding: 1rem;margin: 0; min-height: 60px;" id="initial">
            <h6>How to Use?</h6>
            <ol>
            <li>EPGStationのアドレスを入力。</li>
            <li>TVTest.exeを選択する。(オプション)</li>
            <li>"Notification"オンで番組開始3分前に通知。</li>
            <li>"Reload Interval"で情報取得頻度を変更。(Default:60秒)</li>
            </ol>
            </div>
            <div class="card-action">
            <a href="#settings" class="modal-trigger" onclick="initSettings();return false;">初期設定を行う</a>
            </div>
            </div>`)
    } else {
        default_timer = JSON.parse(localStorage.reload_interval);
        epgstation_url = JSON.parse(localStorage.epgstation_url);
        if(epgstation_url.slice(-1) != "/") epgstation_url += "/";
        timer = default_timer;
        int_res = int_timer = null;
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
active();

