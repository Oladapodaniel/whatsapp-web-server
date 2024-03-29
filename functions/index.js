// Create a basic app with express
const express = require('express');
const {
    Client,
    RemoteAuth
} = require('whatsapp-web.js');
const {
    MessageMedia
} = require('whatsapp-web.js');
const app = express();
const port = process.env.PORT || 3001;
const http = require("http");
const server = http.createServer(app);
const {
    Server
} = require("socket.io")
const {
    MongoStore
} = require('wwebjs-mongo');
const mongoose = require('mongoose');
// const puppeteer = require('puppeteer');


app.get('/', (req, res) => {
    res.send('<h1>Node application</h1>');
});

// const executablePath = puppeteer.executablePath();
// console.log('======', executablePath, '======')

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});


server.listen(port, () => {
    console.log('running at', port)
});


// SAVING SESSION TO REMOTE MONGODB STORE COLLECTION

const MONGODB_URI = "mongodb+srv://oladapodaniel10:EdL7yYUcuLDAF0qB@cluster0.pmppn5h.mongodb.net/test?retryWrites=true&w=majority&authSource=admin"

let store;
mongoose.connect(MONGODB_URI).then(() => {
    console.log('connected to mongodb')
    store = new MongoStore({
        mongoose: mongoose
    });
}).catch(err => {
    console.log(err, 'error connecting to store');
})


// INITIALIZE VARAIBLES

let allSessionObject = {};
let mediaBase64 = {};
let qrCounter = 0;
let scheduleMessagePayload = {}




// RETRIEVE AUTHENTICATED SESSION
const getWhatsappSession = (id, socket, reconnect) => {
    const client = new Client({
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            // executablePath: executablePath
        },
        authStrategy: new RemoteAuth({
            clientId: id,
            store: store,
            backupSyncIntervalMs: 300000
        })
    })



    client.on('qr', (qr) => {
        console.log('retrieved qr code', qr, id+'here')
        socket.emit("qr", {
            qr,
            message: 'Client got log out, but here is the qr'
        })
        qrCounter++
        if (qrCounter > 10) {
            client.destroy();
            socket.emit('clientdestroyed')
            console.log('client destroyed');
            qrCounter = 0
        }
    })

    client.on('message', (message) => {
        socket.emit('newmessage', message)
    })

    client.on('change_state', (state) => {
        console.log(state, 'client current state')
    })

    client.on('auth_failure', (message) => {
        console.log(message, 'client auth failed')
    })
    
    client.on('incoming_call', (call) => {
        console.log(call, 'Here is the call object')
    })
    
    client.on('media_uploaded', (message) => {
        console.log(message, 'Media uploaded')
    })

    client.on('disconnected', () => {
        console.log('client disconnected')
        socket.emit('reconnectclient', {
            id,
            message: 'Client got disconnected, attempting to reconnect ...'
        })
    })

    client.on('authenticated', async () => {
        console.log('Client is Authenticated')
    })

    client.on('ready', () => {
        console.log('Client is ready!');
        allSessionObject[id] = client
        socket.emit("ready", {
            id,
            message: "client is ready"
        })
        getAllChats(client, socket, id);

        if (reconnect == 'reconnect') {
            console.log('ready and recnnectd');
            let { Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File } = scheduleMessagePayload[id]
            console.log(Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File, 'destructured')
            sendScheduledMessage(Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File, socket)
        }
    });


    client.on('remote_session_saved', () => {
        console.log('remote session saved')
        socket.emit('remotesessionsaved', {
            id,
            message: 'Remote session saved to mongodb'
        })
    })

    client.initialize();
}


// SOCKET CONNECTION

io.on('connection', (socket) => {
    console.log('user connected', socket.id);
    socket.emit('message', 'This is a test message from the server')
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
    socket.on('connected', () => {
        console.log('connected to the server')
        socket.emit('Hello', 'Hello form server')
    })

    socket.on('resetmediaobject', ({ data, id }) => {
        mediaBase64[id] = data
    })

    socket.on('chunk', ({ chunk, uploadedChunks, totalChunks, id }) => {
        mediaBase64[id] += chunk
        // if (mediaBase64[id]) {
        //     socket.emit('fileready')
        //     console.log('reaching here')
        // }
        console.log(id, 'checking');
        console.log("==");

        // // Calculate progress in percentage
        let chunkProgress = Math.ceil((uploadedChunks / totalChunks) * 100);
        console.log(`Progress: ${chunkProgress}%`);
        socket.emit('chunkprogress', chunkProgress)
    })

    socket.on('clearfile', ({ data, id }) => {
        mediaBase64[id] = data
    })

    socket.on('getsession', (data) => {
        console.log('GET_SESSION_ID_1', data)
        const {
            id
        } = data
        getWhatsappSession(id, socket, '')
    })


    socket.on('sendwhatsappmessage', ({
        id,
        phone_number,
        message,
        whatsappAttachment
    }) => {
        console.log('sending message')
        const client = allSessionObject[id];

        console.log(id, 'ID')
        console.log(phone_number, 'PHONENUMBER')
        console.log(whatsappAttachment, 'WhatsappAttachment')
        // getChatById(client, phone_number)
        phone_number.forEach(item => {
            let number = item.phoneNumber.trim().replaceAll(" ", "") + "@c.us";
            if (number.substring(0, 1) == '+') {
                // If the number is frmated : +234xxxxxxxxxxxx
                const chatId = number.substring(1)
                sendMessage(chatId, message, whatsappAttachment, client, id, item.name, socket)
            } else {
                // If the number is formatted: 234xxxxxxxxxxxx
                const chatId = number
                sendMessage(chatId, message, whatsappAttachment, client, id, item.name, socket)
            }
        })
        socket.emit('messagesent', {
            status: 200,
            message: 'Message sent successfully',
        })
    })

    socket.on('sendtogroups', ({
        id,
        groups,
        message,
        whatsappAttachment
    }) => {
        const client = allSessionObject[id];
        console.log(groups)
        console.log(whatsappAttachment)
        groups.forEach(group => {
            const groupId = group.trim().replaceAll(" ", "") + "@g.us";
            sendMessage(groupId, message, whatsappAttachment, client, id, null, socket)
        })
    })

    socket.on('sendscheduledwhatsappmessage', ({ Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File }) => {
        console.log({ Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File });
        scheduleMessagePayload[SessionId] = { Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File }
        // socket.emit('schedulepayload', { Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File })
        sendScheduledMessage(Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File, socket)
    })

    // socket.on('deleteremotesession' , async({ session }) => {
    //     console.log(store, session);
    //     try {
    //         // let data = await store.delete({ session });
    //         const mongoConn = mongoose.connection;
    //        let data = await mongoConn.collection('test').deleteOne({ _id: session });
    //         console.log(data, 'ssss');
    //     } catch (error) {
    //         console.error(error);
    //     }

    // })
});

/////////// CHANGE THE REMTE URL

// ============================================================================================

// Send whatsapp message

function sendMessage(chatId, message, whatsappAttachment, client, id, name, socket) {
    if (client) {
        if (message.includes("#name#")) {
            message = message.replaceAll("#name#", name ? name : "")
        }
        if (whatsappAttachment && Object.keys(whatsappAttachment).length > 0 && (whatsappAttachment.MimeType || whatsappAttachment.mimeType)) {
            // If a file is attached
            const media = new MessageMedia((whatsappAttachment.MimeType || whatsappAttachment.mimeType), mediaBase64[id], (whatsappAttachment.FileName || whatsappAttachment.fileName));
            client.sendMessage(chatId, media, {
                caption: message
            }).then(() => {
                console.log('message sent with media')
            }).catch(err => {
                console.log(err, 'err');
            })

        } else {
            // If no file is attached
            client.sendMessage(chatId, message).then(() => {
                console.log('message sent')
            }).catch(err => {
                console.log(err, 'err');
            })
        }
    } else {
        console.log('client is not defined');
        getWhatsappSession(id, socket, 'reconnect')
        // socket.emit('reconnectclient', {
        //     id,
        //     message: 'Client got disconnected, attempting to reconnect ...' 
        // })
    }

}
// ============================================================================================
//   CUSTOM FUNCTIONS AND WHATSAPP API METHODS CALL
// --------------------------------------------------------------------------------------------
// GET ALL CHATS

const getAllChats = async (client, socket, id) => {
    const chats = await client.pupPage.evaluate(async () => {
        const chats = await window.WWebJS.getChats();
        return chats
    })
    socket.emit('allchats', {
        id,
        chats,
        message: 'Here are all chats'
    })
}


// ------------------------------------------------------------------------------------------
// GET CHAT BY ID

const getChatById = async (client, phone_number) => {
    console.log('getting chats bio data');
    try {
        //   console.log(1)
        // const chats = await Promise.all(phone_number.map(number => client.getChatById(`${number}@c.us`)));
        // console.log(chats, 'here')
        for (let i = 0; i < phone_number.length; i++) {
            let number = phone_number[i];
            number = number.trim().replaceAll(" ", "") + "@c.us";
            if (number.substring(0, 1) == '+') {
                // If the number is formated : +234xxxxxxxxxxxx
                const chatId = number.substring(1)
                const chat = await client.getChatById(chatId);
                console.log(chat, 'plus')
                // sendMessage(chatId, message, whatsappAttachment, client, id, socket)
            } else {
                // If the number is formatted: 234xxxxxxxxxxxx
                const chatId = number
                const chat = await client.getChatById(chatId);
                console.log(chat, 'without plus')
                // sendMessage(chatId, message, whatsappAttachment, client, id, socket)
            }

            const chatId = '2348035705192@c.us'

            
        }
        // const chat = await client.pupPage.evaluate(async (client) => {
        // })
    } catch (error) {
        console.log(error);
    }
}

// ------------------------------------------------------------------------------------------
// send schedule message

function sendScheduledMessage(Message, WhatsappAttachment, SessionId, ChatRecipients, GroupRecipients, Base64File, socket) {
    if (Base64File) {
        mediaBase64[SessionId] = Base64File
    }
    const client = allSessionObject[SessionId];

    // If sending to phone numbers
    if (ChatRecipients && ChatRecipients.length > 0) {
        ChatRecipients.forEach(item => {
            let number = item.phoneNumber.trim().replaceAll(" ", "") + "@c.us";
            if (number.substring(0, 1) == '+') {
                // If the number is frmated : +234xxxxxxxxxxxx
                const chatId = number.substring(1)
                sendMessage(chatId, Message, WhatsappAttachment, client, SessionId, item.name, socket)
            } else {
                // If the number is formatted: 234xxxxxxxxxxxx
                const chatId = number
                sendMessage(chatId, Message, WhatsappAttachment, client, SessionId, item.name, socket)
            }
        })
    }

    // If sending to groups
    if (GroupRecipients && GroupRecipients.length > 0) {
        GroupRecipients.forEach(group => {
            const groupId = group.trim().replaceAll(" ", "") + "@g.us";
            sendMessage(groupId, Message, WhatsappAttachment, client, SessionId, socket)
        })
    }
}

