#!/bin/bash

npx proto-loader-gen-types --grpcLib=@grpc/grpc-js --outDir=src/protos/ src/protos/*.proto
