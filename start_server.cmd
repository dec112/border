@echo off
cls

cd dist
set NODE_ENV=development
#set DEBUG=express:*
start node.exe index.js
