# Roadmap

## City-wide simulation upgrade
- [ ] Static OpenStreetMap road network (connected graph) for Coimbatore + surroundings
- [ ] Coimbatore operational geofence polygon + map overlay
- [ ] Vehicles spawn across the network, drive road-based trips to destinations (inside and outside the city)
- [ ] Entry / exit / re-entry detection; local monitoring on/off; history retention; simulated external AI handoff
- [ ] Remove centre-return / bounce logic for vehicles and emergency units
- [ ] Tests for geofence transitions, network connectivity, vehicles leaving the geofence

## Emergency Intelligence upgrade
- [ ] Emergency Intelligence Inbox (ID, type, severity, source, location, time; accept)
- [ ] Available units ranked by computed route time; hospital selection
- [ ] Multiple route alternatives compared (time, distance, congestion, blockages) + recommendation
- [ ] Dispatch + animation on network roads, corridor highlight, signal priority
- [ ] Road blockage → automatic reroute
- [ ] One-click demo scenario
- [ ] Tests for route comparison and rerouting
