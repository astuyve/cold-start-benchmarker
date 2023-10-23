const { LambdaClient, InvokeCommand, UpdateFunctionConfigurationCommand } = require("@aws-sdk/client-lambda")
const lambdaClient = new LambdaClient({ maxAttempts: 10 })
const { createMetricsLogger, Unit, StorageResolution } = require("aws-embedded-metrics");

const invokeFunctions = async (lambdaFunctions, coldStart) => {
  return await Promise.all(lambdaFunctions.map((functionName) => invokeLambdaFunction(functionName, coldStart))) // invoke the functions
}

const delay = async (millis) => {
  return new Promise((result) => setTimeout(result, millis ))
}

const invokeLambdaFunction = async (lambdaFunction, coldStart) => {
  if (coldStart) {
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
    await delay(200)
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
  let requestToHandlerMs
  try {
    const parsed = JSON.parse(res)
    console.log(lambdaFunction, parsed)
    const bodyParsed = JSON.parse(parsed.body)
    const { handlerTs } = bodyParsed
    requestToHandlerMs = handlerTs - start
  } catch {
    console.log('Error parsing', res)
    requestToHandlerMs = finished
  }
  const rtt = finished - start
  return {
    functionName: lambdaFunction,
    requestToHandlerMs: requestToHandlerMs,
    roundTripInvokeMs: rtt
  }
}

module.exports.invoke = async (event, context) => {
  const metrics = createMetricsLogger();
  const functionNames = process.env.FUNCTION_NAMES.split(', ')
  const coldStart = true
  const results = await invokeFunctions(functionNames, coldStart)
  results.map((res) => {
    metrics.putMetric(`${res.functionName}-rtt-latency`, res.roundTripInvokeMs, Unit.Milliseconds, StorageResolution.Standard);
  })
  await metrics.flush()
  console.log('done')
  return true
}
