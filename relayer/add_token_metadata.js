require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram } = require('@solana/web3.js');
const borsh = require('borsh');

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Borsh schema for CreateMetadataAccountV3 instruction
class DataV2 {
    constructor(props) {
        this.name = props.name;
        this.symbol = props.symbol;
        this.uri = props.uri;
        this.sellerFeeBasisPoints = props.sellerFeeBasisPoints;
        this.creators = props.creators;
        this.collection = props.collection;
        this.uses = props.uses;
    }
}

class CreateMetadataAccountArgsV3 {
    constructor(props) {
        this.data = props.data;
        this.isMutable = props.isMutable;
        this.collectionDetails = props.collectionDetails;
    }
}

const dataV2Schema = new Map([
    [DataV2, {
        kind: 'struct',
        fields: [
            ['name', 'string'],
            ['symbol', 'string'],
            ['uri', 'string'],
            ['sellerFeeBasisPoints', 'u16'],
            ['creators', { kind: 'option', type: [{ kind: 'struct', fields: [['address', [32]], ['verified', 'u8'], ['share', 'u8']] }] }],
            ['collection', { kind: 'option', type: { kind: 'struct', fields: [['verified', 'u8'], ['key', [32]]] } }],
            ['uses', { kind: 'option', type: { kind: 'struct', fields: [['useMethod', 'u8'], ['remaining', 'u64'], ['total', 'u64']] } }],
        ]
    }]
]);

async function createMetadata() {
    console.log('📝 Creating Fungible Token Metadata...\n');

    const keypairJson = process.env.SOLANA_RELAYER_KEYPAIR_JSON;
    if (!keypairJson) {
        console.error('❌ SOLANA_RELAYER_KEYPAIR_JSON not found in .env');
        process.exit(1);
    }

    const secretKey = Uint8Array.from(JSON.parse(keypairJson));
    const payer = Keypair.fromSecretKey(secretKey);
    console.log('📍 Authority:', payer.publicKey.toBase58());

    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    const mint = new PublicKey('BBZ3xfk8nGZCfymrtQaibWibDS6fUoJzBqh5VZFPEH1k');
    console.log('🪙 Mint:', mint.toBase58());

    // Derive metadata PDA
    const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    );
    console.log('📋 Metadata PDA:', metadataPDA.toBase58());

    // Build instruction data manually
    // Instruction index 33 = CreateMetadataAccountV3
    const name = 'Omega';
    const symbol = 'OMGA';
    const uri = '';

    // Simple manual encoding
    const nameBytes = Buffer.from(name);
    const symbolBytes = Buffer.from(symbol);
    const uriBytes = Buffer.from(uri);

    const instructionData = Buffer.concat([
        Buffer.from([33]), // Instruction discriminator for CreateMetadataAccountV3
        // DataV2
        Buffer.from(new Uint32Array([name.length]).buffer), // name length (little endian)
        nameBytes,
        Buffer.from(new Uint32Array([symbol.length]).buffer), // symbol length
        symbolBytes,
        Buffer.from(new Uint32Array([uri.length]).buffer), // uri length
        uriBytes,
        Buffer.from([0, 0]), // seller_fee_basis_points (u16) = 0
        Buffer.from([0]), // creators = None
        Buffer.from([0]), // collection = None
        Buffer.from([0]), // uses = None
        Buffer.from([1]), // is_mutable = true
        Buffer.from([0]), // collection_details = None
    ]);

    const keys = [
        { pubkey: metadataPDA, isSigner: false, isWritable: true },        // metadata account
        { pubkey: mint, isSigner: false, isWritable: false },               // mint
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },    // mint authority
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },     // payer
        { pubkey: payer.publicKey, isSigner: false, isWritable: false },   // update authority
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const instruction = {
        keys,
        programId: METADATA_PROGRAM_ID,
        data: instructionData,
    };

    try {
        console.log('\n⏳ Sending metadata transaction...');
        const tx = new Transaction().add(instruction);
        const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
        console.log('✅ Metadata created! Tx:', sig);
        console.log('\n🎉 Token now shows as "Omega (OMGA)" on Solscan!');
        console.log('View: https://solscan.io/token/' + mint.toBase58());
    } catch (error) {
        console.error('❌ Failed:', error.message);
        if (error.logs) {
            console.log('Logs:', error.logs.join('\n'));
        }
    }
}

createMetadata();
