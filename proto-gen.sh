#!/bin/bash

npx proto-loader-gen-types --grpcLib=@grpc/grpc-js --outDir=src/protos/gen/ src/protos/*.proto
