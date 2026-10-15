import {ArenaModel} from './arena-model.mjs?v=comp-flow-3';
import {champions} from './arena-data.js?v=comp-flow-3';
export function validateBoard(value){
  if(!value||value.version!==1||typeof value.name!=='string'||!value.name.trim()||value.name.length>60)throw new Error('That board has an invalid name or version.');
  const model=new ArenaModel(champions);
  if(!model.restore(value.state))throw new Error('That board contains invalid champions, items or game state.');
  return {version:1,name:value.name.trim(),state:model.snapshot()};
}
export function encodeBoard(value){
  const bytes=new TextEncoder().encode(JSON.stringify(validateBoard(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeBoard(input){
  let code=input.trim();
  if(code.includes('#board='))code=code.slice(code.indexOf('#board=')+7);
  if(code.length>16000||!code||!/^[\w-]+$/.test(code))throw new Error('Paste a complete board code or board link.');
  try{return validateBoard(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(code.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)))));}
  catch{throw new Error('This board code is invalid or uses unsupported data. Your current board is unchanged.');}
}
