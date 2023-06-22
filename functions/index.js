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
const puppeteer = require('puppeteer');
const fs = require('fs');
// const router = express.Router();
// const serverless = require('serverless-http');



app.get('/', (req, res) => {
    res.send('<h1>Node application</h1>');
});

const executablePath = puppeteer.executablePath();
console.log('======', executablePath, '======')


// router.get('/', (req, res) => {
//     res.send('Node app is running')
// })
// router.get('/add', (req, res) => {
//     res.send('New record added')
// })
// router.get('/demo', (req, res) => {
//     res.json([
//         { name: "Dapo", height: 23}
//     ])
// })
// app.use('/.netlify/functions/api', router);
// module.exports.handler = serverless(app)


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

const MONGODB_URI = "mongodb+srv://oladapodaniel10:EdL7yYUcuLDAF0qB@cluster0.pmppn5h.mongodb.net/?retryWrites=true&w=majority&authSource=admin"

let store;
mongoose.connect(MONGODB_URI).then(() => {
    console.log('connected to mongodb')
    store = new MongoStore({
        mongoose: mongoose
    });
});


// INITIALIZE VARAIBLES

let allSessionObject = {};
let mediaBase64 = ""




// RETRIEVE AUTHENTICATED SESSION
const getWhatsappSession = (id, socket) => {
    const client = new Client({
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath: puppeteer.executablePath()
        },
        authStrategy: new RemoteAuth({
            clientId: id,
            store: store,
            backupSyncIntervalMs: 300000
        })
    })

    client.on('qr', (qr) => {
        console.log('retrieved qr code', qr)
        socket.emit("qr", {
            qr,
            message: 'Client got log out, but here is the qr'
        })
    })

    client.on('authenticated', () => {
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
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
    socket.on('connected', (data) => {
        console.log('connected to the server')
        socket.emit('Hello', 'Hello form server')
    })

    socket.on('chunk', (data) => {
        mediaBase64 += data
        console.log('===================================== \n' + data + '\n==================================================')
    })

    socket.on('getsession', (data) => {
        console.log('GET_SESSION_ID', data)
        const {
            id
        } = data
        getWhatsappSession(id, socket)
    })


    socket.on('sendwhatsappmessage', ({
        id,
        phone_number,
        message,
        type,
        whatsappAttachment
    }) => {
        console.log('sending message')
        const client = allSessionObject[id];

        console.log(id, 'ID')
        console.log(phone_number, 'PHONENUMBER')
        console.log(whatsappAttachment, 'WhatsappAttachment')

        if (type == 'single') {
            const chatId = phone_number.trim().replaceAll(" ", "").substring(1) + "@c.us";
            console.log(chatId, 1)
            if (whatsappAttachment && Object.keys(whatsappAttachment).length > 0) {
                const media = new MessageMedia.fromUrl("https://thenewcom.com/wp-content/uploads/2019/08/event-sunday-worship.jpg");
                client.sendMessage(chatId, media, {
                    caption: message
                }).then(() => {
                    console.log('message sent', 'single')
                    socket.emit('messagesent', {
                        status: 200,
                        message: 'Message sent successfully',
                        id: 'single with media'
                    })
                })
            } else {
                client.sendMessage(chatId, message).then(() => {
                    console.log('message sent', 'single')
                    socket.emit('messagesent', {
                        status: 200,
                        message: 'Message sent successfully',
                        id: 'single'
                    })
                })
            }
        } else {
            phone_number.forEach(number => {
                number = number.trim().replaceAll(" ", "") + "@c.us";
                if (number.substring(0, 1) == '+') {
                    const chatId = number.substring(1)
                    if (whatsappAttachment && Object.keys(whatsappAttachment).length > 0) {
                        const media = new MessageMedia.fromUrl("https://thenewcom.com/wp-content/uploads/2019/08/event-sunday-worship.jpg");
                        client.sendMessage(chatId, media, {
                            caption: message
                        }).then(() => {
                            console.log('message sent with media', 'multiple(+)')
                        })
                    } else {
                        client.sendMessage(chatId, message).then(() => {
                            console.log('message sent', 'multiple(+)')
                        })
                    }
                } else {
                    const chatId = number
                    client.sendMessage(chatId, message).then(() => {
                        console.log('message sent', 'multiple()')
                    })
                }
            })
            socket.emit('messagesent', {
                status: 200,
                message: 'Message sent successfully',
                id: 'multiple'
            })
        }


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
        if (whatsappAttachment && Object.keys(whatsappAttachment).length > 0) {
            groups.forEach(group => {
                const groupId = group.trim().replaceAll(" ", "") + "@g.us";
                const media = new MessageMedia(whatsappAttachment.mimeType, mediaBase64);
                client.sendMessage(groupId, media, {
                    caption: message
                }).then(() => {
                    console.log('message sent with media', 'multiple(+)')
                })
            })
        } else {
            groups.forEach(group => {
                const groupId = group.trim().replaceAll(" ", "") + "@g.us";
                client.sendMessage(groupId, message).then(() => {
                    console.log('message sent to group')
                    socket.emit('groupmessagesent', {
                        status: 200,
                        message: 'Group message sent successfully'
                    })
                })
            })
        }
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

// cnvert t base64

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file.path, (error, data) => {
            if (error) {
                reject(error);
            } else {
                const base64 = data.toString('base64');
                resolve(base64);
            }
        });
    });
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

const getChatById = async (client) => {
    const chatId = '2348035705192@c.us'
    // const chat = await client.pupPage.evaluate(async (client) => {
    const chat = await client.getChatById(chatId);
    // console.log(chat)
    // })
    console.log(chat)
    // socket.emit('allchats', {
    //     id,
    //     chats,
    //     message: 'Here are all chats'
    // })
}


// ============================================================================================




// const express = require('express');
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const app = express();
// const port = 3001;

// const http = require('http');
// const server = http.createServer(app);
// const io = require('socket.io')(server, {
//     cors: {
//         origin: 'http://localhost:8080',
//         methods: ['GET', 'POST'],
//     },
// });

// app.get('/', (req, res) => {
//     res.send('<h1>Hello World</h1>');
// });

// server.listen(port, () => {
//     console.log('Server is running on the port', port);
// });

// let allSessionObject = {};
// const createWhatsappSession = (id, socket) => {
//     const client = new Client({
//         puppeteer: {
//             headless: false,
//             args: ['--no-sandbox']
//         },
//           auth: new LocalAuth({
//             secret: 'YOUR_SECRET',
//             clientId: id
//           }),
//         // authStrategy: new LocalAuth({
//         //     clientId: 'YOUR_CLIENT_ID'
//         // })
//     });

//     client.on('qr', (qr) => {
//         //   console.log('QR RECEIVED', qr);
//         console.log('reaching here')
//           socket.emit('qr', {
//             qr
//           })
//     });

//     client.on('authenticated', () => {
//         console.log('Client is Authenticated')
//     })

//     client.on('ready', () => {
//         console.log('Client is really ready!');
//         allSessionObject[id] = client
//         socket.emit('ready', {
//             id,
//             message: 'Client is ready!!!'
//         })

//         getAllChats(client)
//         // client.on('message', () => {
//         //     console.log('sending message')
//         //     const number = "+2348037716063"
//         //     const chatId = number.substring(1) + "@c.us";
//         //     // if(message.body === '!ping') {
//         //         client.sendMessage(chatId, 'Here is the message for Mr Peter');
//         //     // }   else {
//         //     //     client.sendMessage(message.from, 'ping');
//         //     // }
//         // });

//     });



//     client.on('error', (err) => {
//         console.log(err);
//     });
//     client.initialize();

// }

// const getAllChats = async (client) => {
//     console.log('reaching')
//     const chats = await client.pupPage.evaluate(async () => {
//         const chats = await window.WWebJS.getChats();
//         return JSON.stringify(chats)
//     })
//     // const allChats = await client.getChats();
//     console.log(chats)
// }


// io.on('connection', (socket) => {
//     console.log('a user connected', socket.id);
//     socket.on('disconnect', () => {
//         console.log('user disconnected');
//     });
//     socket.on('connected', (data) => {

//         socket.emit('hello', 'Hello form server');
//     });
//     socket.on('createsession', (data) => {
//         console.log('SESSION_ID', data)
//         const { id } = data
//         createWhatsappSession(id, socket)
//     })
//     socket.on('getAllChats', async(data) => {

//         const client = allSessionObject[data];
//         console.log(allSessionObject[data])
//         console.log(client, 'clients here')
//         // const allChats = await client.getChats();
//         // socket.emit('allchats', allChats)
//     //     const chats =await client.pupPage.evaluate(async () => {
//     //         const chats = await window.WWebJS.getChats();
//     //         return JSON.stringify(chats)
//     //     })
//     //     console.log(chats)
//     //     console.log(JSON.parse(chats).map((chat) => ChatFactory.create(client, chat)));


//     // const chatIds = await client.pupPage.evaluate(() => {
//     //     return window.WWebJS.getChats().map(c => c.id._serialized);
//     // });
//     })
// });


//     const phoneNumbers = ['09033246067', '08035705192'];
//     try {
//   console.log(1)
//   const chats = await Promise.all(phoneNumbers.map(number => client.getChatById(`${number}@c.us`)));
//   console.log(2)
//   const message = 'Hello, World!'; // replace with your message
//   console.log(3)

//   chats.forEach(chat => {
//       chat.sendMessage(message).then(() => {
//           console.log(`Message sent to ${chat.name}`);
//         });
//         console.log(4)
//   });
// }catch(err) {
//     console.log(err, 'Error')
// }