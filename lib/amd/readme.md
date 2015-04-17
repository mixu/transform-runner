# AMD dependencies

## Occur when entering pipeline

- exclude <= as part of the pipeline's filter, never processed or seen


## Execute given a target, alter resolution results

- plugins <= TODO as part of the pipeline, feeding into the pipeline


## Affect value of a dep mapping

- plugins <= no-op resolution
- paths feature <= apply during resolution
- shim.deps <= apply during resolution



# CommonJS

Should own:

--include   -> use glob.sync to get the small set of initial targets
--exclude   -> use minimatch to check matches
--ignore name (dep => __ignorefile only)  -> relpaths need to be resolved
--remap name=code (dep => name only)      -> relpaths need to be resolved
--command, --transform, --global-command, --global-transform

Extras:

- mapping between browser-compatible and node-compatible modules
    - like remap but the code should be resolvable and traversable

## Occur when entering pipeline

- exclude <= part of the pipeline's filter; never processed or seen

## Execute given a target (+ package.json / main config)

- commands
- transforms
- global commands
- global transforms
- JSON format <= TODO instead of passthru, read and write into cache

## Affect value of dep mapping

- remap <= no resolution of the target; force the dep target to become the (materialized) target file
- ignore <= skip resolving; instead, force the dep target to become the build-in ignore file

Note that the new approach means that deps of these files are also parsed correctly.


Maybe move to `source` and `nomap` natively?

## Add resources prior to packing

- remap code
- ignore code

