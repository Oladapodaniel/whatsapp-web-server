// Create a basic app with express
const express = require('express');
const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
const app = express();
const port = process.env.PORT || 3001;
const http = require("http");
const server = http.createServer(app);
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const cors = require('cors')

// app.use(express.json())

app.use(cors({
    origin: '*'
}))

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
  
    if (req.method == "OPTIONS") {
      res.header("Access-Control-Allow-Methods", "PUT, POST, DELETE, PATCH, GET");
      return res.status(200).json({});
    }
  
    next();
  });

  app.get('/', (req, res) => {
    res.send('<h1>Node application</h1>');
  });

//   app.listen(port, () => {
//     console.log('Server is running on the port', port)
// })

// import { Server } from "socket.io";
const { Server }  = require("socket.io")
// const io  = require("socket.io")('https')
const io = new Server(server, {
    cors: {
        // origin: 'http://localhost:8080',
        origin: '*',
        // credentials: true,
        methods: ['GET', 'POST'],
    },
  });

  server.listen(port, () => {
    console.log('running at', port)
  });
//   io.set("origins", "*:*");

// const io = require('socket.io')(server, {
//     cors: {
//         // origin: 'http://localhost:8080',
//         origin: '*',
//         methods: ['GET', 'POST'],
//     },
// });


// SAVING SESSION TO REMOTE MONGODB STORE COLLECTION

const MONGODB_URI = "mongodb+srv://oladapodaniel10:EdL7yYUcuLDAF0qB@cluster0.pmppn5h.mongodb.net/?retryWrites=true&w=majority"

let store;
mongoose.connect(MONGODB_URI).then(() => {
    console.log('connected to mongodb')
    store = new MongoStore({ mongoose: mongoose });
});

// INITIALIZE VARAIBLES

let allSessionObject = {};
let sessionId = ""


// CREATE NEW SESSION

const createWhatsappSession = (id, socket) => {
const client = new Client({
    puppeteer: {
        headless: false,
    },
    // auth: new LocalAuth({
    //     secret: 'YOUR_SECRET',
    //     clientId: id
    // })
    authStrategy: new RemoteAuth({
        clientId: id,
        store: store,
        backupSyncIntervalMs: 300000
    })
})


client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('QR RECEIVED', qr);
    socket.emit('qr', {
        qr
    })
});

client.on('authenticated', () => {
        console.log('Client is Authenticated')
    })

client.on('ready', () => {
    allSessionObject[id] = client
    console.log('Client is ready!');
    socket.emit('ready', {
        id,
        message: 'Client is ready!!!'
    })
    getAllChats(client, socket, id);
});

client.on('remote_session_saved', () => {
    console.log('remote session saved')
})

client.initialize();

}



// RETRIEVE AUTHENTICATED SESSION
const getWhatsappSession = (id, socket) => {
    const client = new Client({
        puppeteer: {
            headless: false,
        },
        // authStrategy: new RemoteAuth({
        //     clientId: id,
        //     store: store,
        //     backupSyncIntervalMs: 300000
        // })
        authStrategy: new LocalAuth({
            
            clientId: id
        })
    })

    client.on('qr', (qr) => {
        console.log('retrieved remote session', qr)
        socket.emit("qr", {
            qr,
            message: 'Client got log out, but here is the qr'
        })
    })

    client.on('ready', () => {
        console.log('Client is ready!');
        allSessionObject[id] = client
        socket.emit("ready", {
            id,
            message: "client is ready"
        })
        getAllChats(client, socket, id);
        getChatById(client);
    });

    client.initialize();
}


// SOCKET CONNECTION

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);
    socket.on('disconnect', () => {
      console.log('user disconnected');
    });
    socket.on('connected', (data) => {
      console.log('connected to the server')
      socket.emit('Hello', 'Hello form server')
    })
    socket.on('createsession', (data) => {
        console.log('SESSION_ID', data)
        const { id } = data
        createWhatsappSession(id, socket)
    })
    
    socket.on('getsession', (data) => {
        console.log('GET_SESSION_ID', data)
        const { id } = data
        sessionId = data.id
        console.log('retrieved session id', sessionId)
        getWhatsappSession(id, socket)
    })
    socket.on('sendwhatsappmessage', ({ phone_number, message, type }) => {
        console.log('sending message')
        
        const client = allSessionObject[sessionId];
        console.log(sessionId, 'sesionid here')
        console.log(phone_number, 'PHNOENUMBER')
        if (type == 'single') {
            const chatId = phone_number.substring(1) + "@c.us";
            client.sendMessage(chatId, message).then(() => {
                socket.emit('messagesent', {
                    status: 200,
                    message: 'Message sent successfully'
                })
            })
        }   else {
            phone_number.forEach(number => {
                if (number.substring(0, 1) == '+') {
                    const chatId = number.substring(1) + "@c.us";
                    client.sendMessage(chatId, message).then(() => {
                        socket.emit('messagesent', {
                            status: 200,
                            message: 'Message sent successfully'
                        })
                    })
                } else {
                    const chatId = number + "@c.us";
                    client.sendMessage(chatId, message).then(() => {
                        socket.emit('messagesent', {
                            status: 200,
                            message: 'Message sent successfully'
                        })
                    })
                }
            })
        }
    })
  });


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
//         console.log('connected to the server', data);
//         socket.emit('hello', 'Hello form server');
//     });
//     socket.on('createsession', (data) => {
//         console.log('SESSION_ID', data)
//         const { id } = data
//         createWhatsappSession(id, socket)
//     })
//     socket.on('getAllChats', async(data) => {
//         console.log(data, 'all cahts here')
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



    // ==========================

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