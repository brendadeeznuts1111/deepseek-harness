#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('--version')) {
  process.stdout.write('1.2.3\n')
  process.exit(0)
}
if (args.some(arg => arg.startsWith('--sleep='))) {
  const seconds = Number(args.find(arg => arg.startsWith('--sleep='))?.slice('--sleep='.length))
  await new Promise(resolve => setTimeout(resolve, seconds * 1000))
  process.exit(0)
}
if (args.some(arg => arg.startsWith('--repeat='))) {
  const count = Number(args.find(arg => arg.startsWith('--repeat='))?.slice('--repeat='.length))
  process.stdout.write('x'.repeat(count))
  process.exit(0)
}
if (args.includes('--echo-env')) {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  process.stdout.write(Buffer.concat(chunks))
  process.stdout.write(`[${process.env.SEAM_VAR}][${process.env.DSH_SEAM_VAR}]\n`)
  process.exit(0)
}
process.stdout.write(`${args.join(' ')}\n`)
