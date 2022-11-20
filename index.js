const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

//middle ware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Password}@cluster0.cnhrqkg.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// jwt function

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "forbidden access" })
        }
        req.decoded = decoded;
        next();
    })
    console.log("token inside", token)
}
async function run() {
    try {
        const appointmentSlotCollection = client.db('DoctorPortal').collection('appointmentSlots');

        const bookingCollections = client.db('DoctorPortal').collection('bookingCollections');

        const usersCollections = client.db('DoctorPortal').collection('users');
        // use aggregate to query multiple collection and then merge data

        app.get('/appointmentSlots', async (req, res) => {
            const date = req.query.date;

            const query = {};
            const bookingQuery = { appointmentDate: date };
            const options = await appointmentSlotCollection.find(query).toArray();

            // all booked data
            const alreadyBooked = await bookingCollections.find(bookingQuery).toArray();


            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);

                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;

            })

            res.send(options);
        });

        /*

        app.get('/v2/appointmentSlots', async (req, res) => {
            const date = req.query.date;
            const options = await appointmentSlotCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: `$booked`,
                                as: 'book',
                                in: '$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        })

        */
        /**
         * api naming convention
         * app.get('/bookings') get all bookings info from server to client.
         * app.get('/bookings/:id') get specific element/item 
         * app.post('/bookings') post to server as a new 
         * app.patch('/bookings/:id') update specific item 
         * app.put('/bookings/:id') update specific item
         */

        // verify with jwt 
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'Forbidden access' });
            }

            const query = { email: email };
            const bookings = await bookingCollections.find(query).toArray();
            res.send(bookings);
        })

        app.post('/bookings', async (req, res) => {
            const bookings = req.body;
            const query = {
                appointmentDate: bookings.appointmentDate,
                treatment: bookings.treatment,
                email: bookings.email

            }
            const alreadyBooked = await bookingCollections.find(query).toArray();
            if (alreadyBooked.length) {
                const message = `You are already have a booking on ${bookings.appointmentDate}`
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingCollections.insertOne(bookings);
            res.send(result);
        });

        // jwt token create 
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollections.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: 'forbidden' });

        });

        // all users

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollections.find(query).toArray();
            res.send(users);
        });

        // check admin or not

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollections.findOne(query);
            res.send({isAdmin: user?.role === 'admin'});
        })

        // users create

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollections.insertOne(user);
            res.send(result);
        });

        // update user by id..

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollections.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: "Forbidden" });
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollections.updateOne(filter, updateDoc, options);
            res.send(result);
        })
    }
    finally {

    }
}


run().catch(error => console.log(error));








app.get('/', async (req, res) => {
    res.send("Doctor portal server is running");
});

app.listen(port, () => {
    console.log(`The ${port} is running`);
})