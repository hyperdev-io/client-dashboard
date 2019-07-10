const MOLLIE_KEY = 'test_axc6jebk6tphaEhDPGeNS6uvxwwv87';
const mollie_client = require('@mollie/api-client')({ apiKey: MOLLIE_KEY });

const {createDB} = require('./db');
const payment_database = createDB('mollie_db')

// invoice: object with invoice data (straight from moneybird)
// payment: object with payment data (straight from mollie)
// invoice_payment: object used with the local DB: {_id: invoice.id, payment_id: payment.id}

const createPaymentData = (invoice) => new Promise(async (resolve, reject) => {

    try {

        const payment = await createPaymentForInvoice(invoice);
        const invoice_payment = {_id: invoice.id, payment_id: payment.id};
        await payment_database.insert(invoice_payment, (err, docs) => {
            if (err) {
                reject(err);
            } 
            resolve(payment);
        });

    } catch (err) {
        reject(err);
    }
});



const createPaymentForInvoice = (invoice) => new Promise ( async (resolve, reject) => {
    let value;
    // if the string only has a single character after the dot, add a zero
    // e.g. 10.0 -> 10.00, 12.5 -> 12.50
    if (invoice.total_unpaid.match(/\..$/)) {
        value = `${invoice.total_unpaid}0`;
    } else {
        value = invoice.total_unpaid;
    }

    if (value == '0.00' && MOLLIE_KEY.startsWith('test_')) {
        value = '10.00';
    }

    try {
        const payment = await mollie_client.payments.create({
            amount: {
                value,
                currency: invoice.currency,
            },
            description: "MY first payment",
            redirectUrl: `http://dashboard.hyperdev.local:8081/portal/invoices?payment_invoice_id=${invoice.id}`,
        });
        resolve(payment);
    } catch (err) {
        console.log(err)
        reject(Error("Could not create payment with payment provider"));
    }
});




const getPaymentUpdate = (payment_id) => mollie_client.payments.get(payment_id)


const getPaymentFromDB = (invoiceId) => new Promise( (resolve, reject) => {
    console.log("looking for invoice: ", invoiceId)
    payment_database.findOne({_id: invoiceId}, (err, invoice_payment) => {
        if (err) {
            console.log("Did not find invoice: ", err)
            reject(err);
        }
        console.log("found invoice: ", invoice_payment)
        resolve(invoice_payment);
    });
});



exports.getPaymentForInvoice = (invoice) => new Promise( async (resolve, reject) => {

    // look in DB for invoice_payment
    let paymentData = await getPaymentFromDB(invoice.id).catch(null);
    console.log("PAYMENTDATA: ", paymentData);


    const payment = await (async () => { 
        if (paymentData === null) {
            // no previous payment exists
            return await createPaymentData(invoice);
        } else {
            // a previous payment exists, so we check it's status
            const {payment_id} = paymentData;
            const payment_update =await getPaymentUpdate(payment_id);
            if (payment_update.status == 'expired') {
                console.log("EXPIRED")
                // Renew payment
            } else {
                return payment_update;
            }
        }
    })()


    /*let payment;
    if (paymentData !== null) {
        const {payment_id} = paymentData;
        console.log("payment exists: ", payment_id)
        payment = await getPaymentUpdate(payment_id);
    } else {
        console.log("payment not found")
        payment = await createPaymentData(invoice);
    }*/
    console.log("PAYMENT: ", payment);

    resolve(payment)
});