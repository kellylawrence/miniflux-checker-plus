var defaults = {
    'interval': 5, 
    'lastEntry': 0,
    'maxNotifications': 5,
    'notifications': true,
    'password': '',
    'url': '',
    'username': '',
    'useIcons': true,
    'token': '',
    'iconColor': '#999999',
    'badgeBackgroundColor': '#294e5f',
    'badgeBadRequestBackgroundColor': '#ff0000',
    'badgeTextColor': '#ffffff'
}

async function setDefaults() {
    var settingsNames = Object.getOwnPropertyNames(defaults)
    var settings = await browser.storage.local.get(settingsNames)
    var info = await browser.storage.local.get([
        'iconColor', 'badgeBackgroundColor', 'badgeBadRequestBackgroundColor', 'badgeTextColor'])
    const iconColor = info.iconColor || defaults.iconColor;
    const badgeBackgroundColor = info.badgeBackgroundColor || defaults.badgeBackgroundColor;
    const badgeTextColor = info.badgeTextColor || defaults.badgeTextColor;

    const svgTemplate = `
    <svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 430" width="430" height="430">
	<style>
		.s0 { fill: ${iconColor} }
	</style>
	<path class="s0" d="m139.2 81q5.3-2.8 10.8-4.8 5.5-2.1 11.3-3.5 5.7-1.4 11.6-2.1 5.9-0.7 11.8-0.6 50.4 0 64.2 43.8 3.9-4.7 8.3-9 4.4-4.3 9.1-8.2 4.7-3.9 9.8-7.4 5-3.5 10.3-6.5 22.2-12.7 49.4-12.7 37.8 0 54 23.1 16.2 23.1 16.2 69.3v174q0 6.5 1.8 8.9c1.2 1.5 3.9 3 8 4.1l14.2 4.7v10.7h-84.5q-11 0-15.8-8.3-4.8-8.3-4.9-24.9v-179.9q0-26.6-5.9-37.8-5.9-11.3-19.7-11.3-21.9 0-46.7 26 0.7 4.2 1.2 8.4 0.4 4.2 0.8 8.4 0.3 4.3 0.4 8.5 0.1 4.2 0.1 8.5v174q0 6.5 1.8 8.9c1.2 1.5 3.9 3 8 4.1l14.2 4.7v10.7h-84.5q-11 0-15.9-8.3-4.8-8.3-4.8-24.9v-179.9q0-26.6-5.9-37.8-5.9-11.3-19.7-11.3-21.6 0-44.3 23.7v210.1q0 6.5 1.8 9.2 1.9 2.6 7.6 4.4l13.8 4.1v10.7h-128.4v-10.7l14.2-4.7q6.1-1.8 8-4.1 1.8-2.4 1.8-8.9v-223.7q0-6.5-1.8-8.9-1.9-2.4-8-4.2l-14.2-4.7v-10.6l97.5-17.8h6.9v41.4q3.9-4 8.2-7.8 4.3-3.7 8.8-7.1 4.5-3.4 9.3-6.4 4.8-3 9.8-5.6z"/>
</svg>`;

    // Turn into a Blob
    const blob = new Blob([svgTemplate], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    // Draw into a canvas to get ImageData
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 32, 32);
    const imageData = ctx.getImageData(0, 0, 32, 32);

    // Apply as action icon
    browser.browserAction.setIcon({ imageData });
    browser.browserAction.setBadgeBackgroundColor({
        color: badgeBackgroundColor
    })
    browser.browserAction.setBadgeTextColor({
        color: badgeTextColor
    })

    var val
    for (let setting in defaults) {
        if (defaults.hasOwnProperty(setting)) {
            if (settings[setting] === undefined) {
                val = defaults[setting]
            } else {
                val = settings[setting]
            }
            settings[setting] = val
        }
    }
    browser.storage.local.set(settings)
}

function sanitizeInterval(settings) {
    var interval
    if (settings.hasOwnProperty('interval')) {
        interval = settings.interval
    } else {
        interval = ''
    }
    return interval ? parseFloat(interval) : 0.1
}

async function checkFeeds() {
    var info = await browser.storage.local.get([
        'url', 'username', 'password', 'lastEntry', 'notifications',
        'maxNotifications', 'useIcons', 'token', 'badgeBadRequestBackgroundColor'])
    const badgeBadRequestBackgroundColor = info.badgeBadRequestBackgroundColor || defaults.badgeBadRequestBackgroundColor;

    var url = info.url + '/v1/entries?status=unread&direction=desc'

    var headers = new Headers()

    if (info.token) {
        headers.append('X-Auth-Token', info.token)
    } else {
        headers.append('Authorization',
            'Basic ' + btoa(`${info.username}:${info.password}`))
    }

    let bad_request = false
    try {
        var response = await fetch(url, {credentials: 'include', headers: headers})
    } catch(e) {
        bad_request = true
    }
    if (bad_request || !response.ok) {
        browser.browserAction.setBadgeText({'text': 'X'})
        browser.browserAction.setBadgeBackgroundColor({color: `${badgeBadRequestBackgroundColor}`})
        browser.browserAction.setTitle({title: 'Miniflux Checker [Error connecting to Miniflux]'})
        return
    }
    var body = await response.json()

    browser.browserAction.setBadgeText({
        text: body.total > 0 ? `${body.total}` : ''
    });

    browser.browserAction.setTitle({title: 'Miniflux Checker'})

    var previousLastEntry = info.lastEntry
    if (body.total > 0) {
        var lastEntry = info.lastEntry
        for (let idx=0; idx<body.entries.length; idx++) {
            lastEntry = Math.max(body.entries[idx].id, lastEntry)
        }
        if (lastEntry != info.lastEntry) {
            browser.storage.local.set({'lastEntry': lastEntry})
        }
    }

    if (!info.notifications) {
        return
    }

    var newEntries = []
    for (let idx=0; idx<body.entries.length; idx++) {
        if (body.entries[idx].id > previousLastEntry) {
            newEntries.push(body.entries[idx])
        }
    }

    if (newEntries.length === 0) {
        return
    }

    var numShow
    if (newEntries.length > info.maxNotifications) {
        numShow = info.maxNotifications - 1
    } else {
        numShow = newEntries.length
    }

    var iconIds = []
    var iconData = []
    if (info.useIcons) {
        for (let idx=numShow - 1; idx >= 0; idx--) {
            let entry = newEntries[idx]
            if (iconIds.includes(entry.feed_id)) {
                continue
            }

            if (entry.feed.icon) {
                iconIds.push(entry.feed_id)
                iconData.push(fetch(
                    info.url + `/v1/feeds/${entry.feed_id}/icon`,
                    {credentials: 'include', headers: headers}).
                    then((response) => response.json()))
            }
        }
    }
    if (iconIds) {
        iconData = await Promise.all(iconData)
    }
    var icons = {}
    iconIds.forEach((key, idx) => icons[key] = iconData[idx].data)

    for (let idx=numShow - 1; idx >= 0; idx--) {
        let entry = newEntries[idx]
        let iconUrl
        if (icons.hasOwnProperty(entry.feed_id)) {
            iconUrl = 'data:' + icons[entry.feed_id]
        } else {
            iconUrl = 'icons/icon64.png'
        }
        browser.notifications.create('', {
            'type': 'basic',
            'title': entry.feed.title,
            'message': entry.title,
            'iconUrl': iconUrl
        })
    }

    if (newEntries.length > info.maxNotifications) {
        var msg = `${newEntries.length - numShow}`
        if (info.maxNotifications == 1) {
            msg = msg + ' new feed items....'
        } else {
            msg = msg + ' additional new feed items....'
        }
        browser.notifications.create('', {
            'type': 'basic',
            'title': 'Miniflux',
            'message': msg,
            'iconUrl': 'icons/icon64.png'
        })
    }
}

async function calculateDelay(interval) {
    var alarm = await browser.alarms.get('miniflux-check')

    var newDelay
    if (typeof alarm !== 'undefined') {
        var currentDelay = (alarm.scheduledTime - Date.now()) / 60
        newDelay = Math.max(interval - currentDelay, 0)
    } else {
        newDelay = 0
    }

    return newDelay
}

function handleAlarm(alarm) {
    if (alarm.name === 'miniflux-check') {
        checkFeeds()
    }
}

async function setupAlarm() {
    var settingsKeys = ['interval', 'url', 'token', 'username', 'password']
    var settings = await browser.storage.local.get(settingsKeys)

    // Need non-empty values for the login settings to run alarm

    let settings_good = true
    if (!settings['url']) {
        console.warn('Miniflux refresh disabled due to no URL')
        settings_good = false
    }

    if (!settings['token']) {
        if (!settings['username'] || !settings['password']) {
            console.warn('Miniflux refresh disabled due to no credentials')
            settings_good = false
        }
    }

    if (settings_good) {
        browser.browserAction.enable()
        var interval = sanitizeInterval(settings)
        var delay = await calculateDelay(interval)

        browser.alarms.create('miniflux-check',
            {'delayInMinutes': delay, 'periodInMinutes': interval})
    } else {
        browser.browserAction.disable()
        browser.alarms.clear('miniflux-check')
        browser.browserAction.setBadgeText({text: ''})
        browser.browserAction.setTitle({title: 'Miniflux Checker [Missing required settings]'})
    }
}

async function onContextAction(actionInfo) {
    if (actionInfo.menuItemId === 'miniflux-show-unread') {
        var settings = await browser.storage.local.get(['url'])
        if (!settings.url) {
            return
        }
        browser.tabs.create({url: `${settings.url}/unread`})
    }
}

setDefaults()
browser.browserAction.setBadgeBackgroundColor({'color': 'blue'})
browser.browserAction.onClicked.addListener(checkFeeds)
setupAlarm()
browser.alarms.onAlarm.addListener(handleAlarm)

browser.contextMenus.create({
    id: 'miniflux-show-unread',
    title: 'Show unread',
    contexts: ['browser_action']
})
browser.contextMenus.onClicked.addListener(info => onContextAction(info))
