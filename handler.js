const { LambdaClient, InvokeCommand, UpdateFunctionConfigurationCommand } = require("@aws-sdk/client-lambda")
const lambdaClient = new LambdaClient({ maxAttempts: 10 })

const invokeFunctions = async (lambdaFunctions, coldStart) => {
  return await Promise.all(lambdaFunctions.map((functionName) => invokeLambdaFunction(functionName, coldStart))) // invoke the functions
}

const invokeLambdaFunction = async (lambdaFunction, coldStart) => {
  if (coldStart) {
    console.log('triggering cold start')
    await lambdaClient.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: lambdaFunction,
        Environment: {
          Variables: {
            setColdStart: (Math.random() + 1).toString(36).substring(7)
          },
        },
      })
    )
  }
  const start = Date.now()
  const { Payload } = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: lambdaFunction,
      InvocationType: "RequestResponse",
    })
  )
  const finished = Date.now()
  const res = Buffer.from(Payload).toString('utf8')
  const parsed = JSON.parse(res)
  console.log(lambdaFunction, parsed)
  const bodyParsed = JSON.parse(parsed.body)
  const { handlerTs } = bodyParsed
  const requestToHandlerMs = handlerTs - start
  const rtt = finished - start
  return {
    functionName: lambdaFunction,
    requestToHandlerMs: requestToHandlerMs,
    roundTripInvokeMs: rtt
  }
}

module.exports.invoke = async (event, context) => {
  console.log(event.body)
  const { functionNames, coldStart } = JSON.parse(event.body)
  const results = await invokeFunctions(functionNames, coldStart)
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      coldStart,
      results
    })
  }
  return response
}
