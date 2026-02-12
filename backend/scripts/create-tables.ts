import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

try {
  await client.send(
    new CreateTableCommand({
      TableName: 'CoffeeApp',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    })
  );
  console.log('Table CoffeeApp created successfully');
} catch (err) {
  if (err instanceof ResourceInUseException) {
    console.log('Table CoffeeApp already exists');
  } else {
    throw err;
  }
}
