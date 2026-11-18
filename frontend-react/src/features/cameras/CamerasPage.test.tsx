import { test, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Cameras from "../../Cameras";
import { cameraRequest } from "../../shared/api";

vi.mock("../../shared/api", () => ({ cameraRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test.each([true, false])("camera controls respect admin=%s and save one feature at a time",async admin=>{
  vi.stubGlobal("EventSource", class { close() {} });
  const camera={id:3,nombre:"Patio",detection_revision:1,detection_settings:{
    people:true,pets:true,faces:true,motion:false,posture:false,
  }};
  vi.mocked(cameraRequest).mockImplementation(async path=>{
    if(path==="/streams") return [camera];
    if(path==="/camera-settings") return {detection_revision:2,detection_settings:{...camera.detection_settings,posture:true}};
    return {cameras:[camera],profiles:[],events:[]};
  });
  render(<MemoryRouter><Cameras admin={admin}/></MemoryRouter>);
  const posture=await screen.findByRole("checkbox",{name:"Postura"});
  expect(posture).not.toBeChecked();
  expect(screen.getByRole("checkbox",{name:"Reconocimiento facial"})).toBeChecked();
  if (admin) {
    fireEvent.click(posture);
    await waitFor(()=>expect(posture).toBeChecked());
    expect(cameraRequest).toHaveBeenCalledWith("/camera-settings","POST",{cameraId:3,feature:"posture",enabled:true});
  } else expect(posture).toBeDisabled();
});
