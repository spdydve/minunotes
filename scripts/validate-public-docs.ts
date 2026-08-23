import { validatePublicDocs } from './public-docs';

const result = validatePublicDocs();
if (result.errors.length > 0) {
  console.error(`Public documentation validation failed with ${result.errors.length} error(s):`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${result.docs.length} public documentation files.`);
}
