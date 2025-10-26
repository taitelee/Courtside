import * as React from "react";
import { View, Text, TextInput, Button, FlatList } from "react-native";
import { getQueue, joinQueue, leaveQueue } from "../services/api";
import { useQueueRealtime } from "../hooks/useQueueRealtime";
import { randomUUID } from "expo-crypto"; // or your own uuid lib

export default function QueueScreen({ route }) {
  const courtId = route.params?.court_id ?? "demo";
  const [queue, setQueue] = React.useState([]);
  const [version, setVersion] = React.useState(0);
  const [name, setName] = React.useState("");
  const [myId, setMyId] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      const data = await getQueue(courtId);
      setQueue(data.queue); setVersion(data.version);
    })();
  }, [courtId]);

  useQueueRealtime(courtId, (q, v) => { setQueue(q); setVersion(v); });

  const handleJoin = async () => {
    const id = randomUUID();
    console.log("Generated UUID:", id, "Type:", typeof id, "Length:", id.length);
    setMyId(id);
    // optimistic update (optional)
    setQueue(q => [...q, { id, display_name: name, position: q.length+1, status:'active' }]);
    try {
      const data = await joinQueue(courtId, id, name);
      setQueue(data.queue); setVersion(data.version);
    } catch (error) {
      console.error("Join queue error:", error);
      // rollback
    }
  };

  const handleLeave = async () => {
    if (!myId) return;
    await leaveQueue(courtId, myId);
    // server will broadcast the new queue; no local change needed
  };

  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{ fontSize:18, fontWeight:"600" }}>Court {courtId} (v{version})</Text>
      <FlatList
        data={queue}
        keyExtractor={(e)=>e.id}
        renderItem={({item}) => <Text>{item.position}. {item.display_name}</Text>}
      />
      <TextInput
        placeholder="Your name"
        value={name}
        onChangeText={setName}
        style={{ borderWidth:1, padding:8, marginTop:12 }}
      />
      <Button title="Join queue" onPress={handleJoin} />
      <Button title="Leave queue" onPress={handleLeave} disabled={!myId} />
    </View>
  );
}